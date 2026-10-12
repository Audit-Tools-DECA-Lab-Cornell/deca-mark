import csv
import json
from copy import deepcopy
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from tests.conftest import signer
from tests.local_database import admin_sql, disposable_database_selected
from tests.test_observation_analysis_exports import files
from tests.test_site_packages import polygon, submission
from tests.test_zone_api_live import LiveApi, live_api
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration
__all__ = ["live_api", "signer"]


@pytest.fixture(scope="session", autouse=True)
def require_disposable_database() -> None:
    if not disposable_database_selected():
        raise RuntimeError(
            "GIS-09 acceptance requires the disposable zone API rehearsal"
        )


def scoped_sql(api: LiveApi, statement: str) -> object:
    result = admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; "
        "SELECT set_config('fieldmaps.user_id', :'caller', true); "
        + statement
        + "; ROLLBACK;",
        *api.tenant.variables(),
        f"caller={api.tenant.users['viewer']}",
    )
    return json.loads(result.splitlines()[-1])


def assert_export_metadata(
    sql_rows: list[dict[str, object]],
    csv_rows: list[dict[str, str]],
    events: list[dict[str, object]],
) -> None:
    csv_by_id = {row["observation_id"]: row for row in csv_rows}
    event_by_id = {feature["id"]: feature for feature in events}
    fields = {
        "package_id": "package_id",
        "map_version": "package_version",
        "zone_id": "zone_id",
        "zone_code": "zone_code",
        "zone_label_at_capture": "zone_label_at_capture",
        "assignment_basis": "assignment_basis",
        "spatial_support": "spatial_support",
        "round_type": "round_type",
        "form_version": "form_version",
    }
    for sql_row in sql_rows:
        identifier = str(sql_row["observation_id"])
        event = event_by_id[identifier]
        properties = event["properties"]
        assert isinstance(properties, dict)
        for exported_field, sql_field in fields.items():
            value = sql_row[sql_field]
            assert csv_by_id[identifier][exported_field] == (
                "" if value is None else str(value)
            )
            assert properties[exported_field] == value
        assert (event["geometry"] is not None) == (
            sql_row["spatial_support"] == "point"
        )
        if sql_row["round_type"] == "inventory":
            assert csv_by_id[identifier]["longitude"] == ""
            assert csv_by_id[identifier]["latitude"] == ""
            assert properties["display_anchor_basis"] == sql_row["display_anchor_basis"]


def test_v7_v8_gis_readback_matches_signed_exports(live_api: LiveApi) -> None:
    tenant = live_api.tenant
    project = f"/v1/projects/{tenant.project}"
    drafts = f"{project}/sites/{tenant.site}/zone-drafts"
    legacy_inventory = uuid4()
    point7, inventory7, point8 = uuid4(), uuid4(), uuid4()
    admin_sql(
        "UPDATE fieldmaps.observations SET round_type='standard',first_round=true,"
        "placement_source='hand',zone_code='A' WHERE id=:'observation'; "
        "INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,"
        "form_version_id,observer_code,observed_at,geom,answers,created_by,upload_hash,"
        "round_type,first_round,placement_source,zone_code) "
        "VALUES (:'legacy_inventory',:'org',:'project',:'site',:'form','QA',"
        "'2026-10-10T10:00:00Z',fieldmaps.make_point(-76.485,42.448),"
        '\'{"people":3,"notes":"Synthetic legacy Inventory"}\',:\'observer\','
        "repeat('b',64),'inventory',false,'zone','A');",
        *tenant.variables(),
        f"legacy_inventory={legacy_inventory}",
    )
    geometry7 = {
        "type": "MultiPolygon",
        "coordinates": [
            polygon(-76.4864, 42.4478, -76.4852, 42.4486)["geometry"]["coordinates"],
            polygon(-76.4848, 42.4486, -76.4844, 42.4489)["geometry"]["coordinates"],
        ],
    }
    geometry8 = polygon(-76.4858, 42.4480, -76.4852, 42.4486)["geometry"]
    with live_api.client() as manager:
        for _ in range(6):
            legacy = manager.post(f"{project}/packages", json=submission())
            assert legacy.status_code == 201, legacy.text
        base = document(legacy.content)["package_id"]
        created = manager.post(
            drafts,
            json={
                "request_id": str(uuid4()),
                "base_package_id": base,
                "inventory_form_version": "shell-v1",
            },
        )
        assert created.status_code == 201, created.text
        draft = document(created.content)
        draft_url = f"{drafts}/{draft['draft_id']}"
        zones = deepcopy(draft["zones"])
        zones[0]["geometry"] = geometry7
        zones[0]["zone_label"] = "Synthetic v7 historic lawn"
        zone = zones[0]["zone_id"]
        edited = manager.put(
            draft_url,
            headers={"If-Match": created.headers["etag"]},
            json={
                "zones": zones,
                "change_note": "Synthetic adoption mapping; legacy remains unknown",
            },
        )
        assert edited.status_code == 200, edited.text
        published = manager.post(
            draft_url + "/publish",
            headers={"If-Match": edited.headers["etag"]},
            json={"request_id": str(uuid4()), "expected_current_package_id": base},
        )
        assert published.status_code == 201, published.text
        package7 = document(published.content)["package"]
        assert package7["version"] == 7
        created = manager.post(
            drafts,
            json={
                "request_id": str(uuid4()),
                "base_package_id": package7["package_id"],
            },
        )
        assert created.status_code == 201, created.text
        draft8 = document(created.content)
        draft_url = f"{drafts}/{draft8['draft_id']}"
        zones8 = deepcopy(draft8["zones"])
        zones8[0]["geometry"] = geometry8
        zones8[0]["zone_label"] = "Synthetic v8 smaller lawn"
        edited = manager.put(
            draft_url,
            headers={"If-Match": created.headers["etag"]},
            json={
                "zones": zones8,
                "change_note": "Deliberate shrink; no historical reassignment",
            },
        )
        assert edited.status_code == 200, edited.text
        published = manager.post(
            draft_url + "/publish",
            headers={"If-Match": edited.headers["etag"]},
            json={
                "request_id": str(uuid4()),
                "expected_current_package_id": package7["package_id"],
            },
        )
        assert published.status_code == 201, published.text
        package8 = document(published.content)["package"]
        assert package8["version"] == 8
    analysis = f"/v2/projects/{tenant.project}/observations"
    payload = {
        "schema_version": 2,
        "site_id": str(tenant.site),
        "package_id": package7["package_id"],
        "zone_id": zone,
        "form_version": "shell-v1",
        "round_type": "standard",
        "first_round": True,
        "placement": "hand",
        "coordinates": [-76.4860, 42.4482],
        "observer": "QA",
        "observed_at": "2026-10-10T12:00:00Z",
        "answers": {
            "people": 3,
            "notes": "Synthetic late v7 event after v8 publication",
        },
    }
    inventory_payload = {
        key: value
        for key, value in payload.items()
        if key not in {"first_round", "coordinates"}
    } | {"round_type": "inventory", "placement": "zone"}
    with live_api.client("observer") as collector:
        for identifier, body in (
            (point7, payload),
            (inventory7, inventory_payload),
            (
                point8,
                payload
                | {
                    "package_id": package8["package_id"],
                    "coordinates": [-76.4855, 42.4482],
                },
            ),
        ):
            response = collector.put(f"{analysis}/{identifier}", json=body)
            assert response.status_code == 200, response.text
    with live_api.client("viewer") as viewer:
        page_response = viewer.get(analysis, params={"site_id": str(tenant.site)})
        assert page_response.status_code == 200, page_response.text
        page = document(page_response.content)
        assert page["total_matching"] == 5
        by_id = {row["observation_id"]: row for row in page["items"]}
        assert by_id[str(point7)]["package_version"] == 7
        assert by_id[str(point7)]["zone_label"] == "Synthetic v7 historic lawn"
        assert by_id[str(inventory7)]["geometry"] is None
        assert by_id[str(legacy_inventory)]["geometry"] is None
        assert by_id[str(legacy_inventory)]["assignment_basis"] == "legacy_unversioned"
        export_dir = Path("/tmp/gis09-exports")
        export_dir.mkdir(parents=True, exist_ok=True)
        bundles = {}
        for format_name in ("csv", "geojson"):
            exported = viewer.get(
                analysis + "/export",
                params={"site_id": str(tenant.site), "format": format_name},
            )
            assert exported.status_code == 200, exported.text
            (export_dir / f"{format_name}.zip").write_bytes(exported.content)
            bundles[format_name] = files(exported.content)
    csv_rows = list(
        csv.DictReader(StringIO(bundles["csv"]["observations.csv"].decode("utf-8-sig")))
    )
    events = document(bundles["geojson"]["observations.geojson"])["features"]
    historical = document(bundles["geojson"]["historical-zones.geojson"])["features"]
    assert len(csv_rows) == len(events) == 5
    assert len(historical) == 2
    assert len([feature for feature in events if feature["geometry"] is not None]) == 3
    assert {row["observation_id"] for row in csv_rows} == set(by_id)
    assert {feature["id"] for feature in events} == set(by_id)
    sql_rows = scoped_sql(
        live_api,
        "SELECT jsonb_agg(to_jsonb(r) ORDER BY observation_id) FROM gis.recorded_observations r "
        "WHERE site_id=:'site'",
    )
    assert len(sql_rows) == 5
    assert_export_metadata(sql_rows, csv_rows, events)
    sql_by_id = {row["observation_id"]: row for row in sql_rows}
    for identifier, api_row in by_id.items():
        sql_row = sql_by_id[identifier]
        for key in (
            "package_id",
            "package_version",
            "zone_id",
            "zone_code",
            "assignment_basis",
            "spatial_support",
        ):
            assert sql_row[key] == api_row[key]
        assert sql_row["zone_label_at_capture"] == api_row["zone_label"]
    counts = scoped_sql(
        live_api,
        "SELECT jsonb_build_object('recorded',(SELECT count(*) FROM gis.recorded_observations WHERE site_id=:'site'),"
        "'points',(SELECT count(*) FROM gis.point_events WHERE site_id=:'site'),"
        "'inventory',(SELECT count(*) FROM gis.inventory_records WHERE site_id=:'site'),"
        "'legacy',(SELECT count(*) FROM gis.legacy_records WHERE site_id=:'site'),"
        "'snapshots',(SELECT count(*) FROM gis.zone_snapshots WHERE site_id=:'site'))",
    )
    assert counts == {
        "recorded": 5,
        "points": 3,
        "inventory": 2,
        "legacy": 2,
        "snapshots": 2,
    }
    topology = scoped_sql(
        live_api,
        "SELECT jsonb_build_object('parts',extensions.ST_NumGeometries(old.geom),"
        "'old_covers',extensions.ST_Covers(old.geom,fieldmaps.make_point(-76.4860,42.4482)),"
        "'new_covers',extensions.ST_Covers(new.geom,fieldmaps.make_point(-76.4860,42.4482)),"
        "'inventory_exact',(SELECT extensions.ST_AsEWKB(i.geom)=extensions.ST_AsEWKB(old.geom) "
        "FROM gis.inventory_records i WHERE i.package_id=old.package_id AND i.zone_id=old.zone_id)) "
        "FROM gis.zone_snapshots old JOIN gis.zone_snapshots new ON old.zone_id=new.zone_id "
        "WHERE old.site_id=:'site' AND old.package_version=7 AND new.package_version=8",
    )
    assert topology == {
        "parts": 2,
        "old_covers": True,
        "new_covers": False,
        "inventory_exact": True,
    }
    expected = {
        "synthetic": True,
        "project_id": str(tenant.project),
        "site_id": str(tenant.site),
        "zone_id": zone,
        "package_v7": package7["package_id"],
        "package_v8": package8["package_id"],
        "delayed_point": str(point7),
        "bound_inventory": str(inventory7),
        "current_point": str(point8),
        "legacy_point": str(tenant.observation),
        "legacy_inventory": str(legacy_inventory),
        "counts": counts,
        "topology": topology,
    }
    (export_dir / "acceptance-expected.json").write_text(
        json.dumps(expected, indent=2) + "\n"
    )
    (export_dir / "sql-readback.json").write_text(json.dumps(sql_rows, indent=2) + "\n")
