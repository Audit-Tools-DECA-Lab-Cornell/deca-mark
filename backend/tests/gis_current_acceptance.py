"""Current-schema GIS/API agreement; executed after BE-22 against disposable PostGIS."""

import csv
import json
import subprocess
import sys
from collections.abc import Iterator
from io import StringIO
from pathlib import Path
from typing import ClassVar, cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter

from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.observation_analysis_schemas import ObservationPage
from fieldmaps_api.zone_response_schemas import HistoricalZones, PackageForms
from tests.conftest import signer
from tests.local_database import admin_sql, disposable_database_selected
from tests.package_fixtures import submission
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, create_tenant, sign_in
from tests.test_observation_analysis_exports import files
from tests.zone_api_fixtures import ZoneSite, clean_zone_tenant, create_draft, document

pytestmark = pytest.mark.integration
__all__ = ["gis_workspace", "signer"]
ROOT = Path(__file__).resolve().parents[2]


class RecordedZone(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    observation_id: UUID
    package_id: UUID
    package_version: int
    zone_id: UUID
    zone_code: str
    zone_label_at_capture: str
    spatial_support: str
    round_type: str


def publish_inventory(client: TestClient, project: str) -> str:
    created = client.post(
        f"{project}/forms",
        json={
            "code": "gis-inventory",
            "name": "Synthetic GIS Inventory",
            "definition": {
                "version": "synthetic-v1",
                "title": "Synthetic whole-zone Inventory",
                "summary": "Disposable GIS acceptance only",
                "source": "Synthetic test",
                "status": "draft",
                "inclusion": "Synthetic test",
                "questions": [
                    {
                        "id": "notes",
                        "code": "notes",
                        "exportColumn": "notes",
                        "act": "Record",
                        "label": "Inventory notes",
                        "kind": "text",
                        "source": "Synthetic test",
                    }
                ],
            },
        },
    )
    assert created.status_code == 201, created.text
    draft = FormVersionDetail.model_validate_json(created.content)
    published = client.post(
        f"{project}/form-versions/{draft.code}/publish",
        headers={"If-Match": draft.etag},
    )
    assert published.status_code == 200, published.text
    version = FormVersionDetail.model_validate_json(published.content)
    assert version.state == "published"
    return version.code


@pytest.fixture
def gis_workspace(
    request: pytest.FixtureRequest, signer: Signer
) -> Iterator[tuple[TestClient, ZoneSite]]:
    # Guard before requesting api_client: ordinary local fixtures may read a password file.
    assert disposable_database_selected(), "GIS acceptance requires its disposable database"
    client = cast("TestClient", request.getfixturevalue("api_client"))
    tenant = Tenant.new()
    create_tenant(tenant)
    sign_in(client, signer, tenant.users["manager"])
    try:
        project = f"/v1/projects/{tenant.project}"
        inventory = publish_inventory(client, project)
        source = document(
            json.dumps(
                submission(site_id=str(tenant.site), inventory_form_version=inventory)
            ).encode()
        )
        layers = source["layers"]
        assert isinstance(layers, dict)
        zones = layers["zones"]
        assert isinstance(zones, dict)
        features = zones["features"]
        assert isinstance(features, list)
        assert isinstance(features[0], dict)
        # Both parts remain one recorded zone, including in the Inventory polygon layer.
        features[0]["geometry"] = {
            "type": "MultiPolygon",
            "coordinates": [
                [
                    [
                        [-76.4864, 42.4478],
                        [-76.4850, 42.4478],
                        [-76.4850, 42.4489],
                        [-76.4864, 42.4489],
                        [-76.4864, 42.4478],
                    ]
                ],
                [
                    [
                        [-76.4848, 42.4480],
                        [-76.4845, 42.4480],
                        [-76.4845, 42.4483],
                        [-76.4848, 42.4483],
                        [-76.4848, 42.4480],
                    ]
                ],
            ],
        }
        created = client.post(f"{project}/packages", json=source)
        assert created.status_code == 201, created.text
        package = document(created.content)["package"]
        assert isinstance(package, dict)
        assert package["package_version"] == 1
        yield client, ZoneSite(tenant, UUID(str(package["package_id"])))
    finally:
        clean_zone_tenant(tenant)


def test_v1_v2_gis_readback_matches_signed_exports(
    gis_workspace: tuple[TestClient, ZoneSite], signer: Signer, tmp_path: Path
) -> None:
    # Given a real first package and a deliberately smaller successor.
    api_client, site = gis_workspace
    initial = api_client.get(f"{site.project_url}/packages/{site.package_id}")
    assert initial.status_code == 200, initial.text
    manifest = document(initial.content)["manifest"]
    assert isinstance(manifest, dict)
    bindings = PackageForms.model_validate(manifest["forms"])
    assert bindings.inventory is not None, "The synthetic fixture must bind Inventory explicitly"
    first = api_client.get(f"{site.url}/zones", params={"package_id": str(site.package_id)})
    history = HistoricalZones.model_validate_json(first.content)
    zone = history.zones[0]
    url, etag, draft = create_draft(api_client, site)
    zones = draft["zones"]
    assert isinstance(zones, list)
    assert isinstance(zones[0], dict)
    zones[0]["geometry"] = {
        "type": "Polygon",
        "coordinates": [
            [
                [-76.4858, 42.4480],
                [-76.4852, 42.4480],
                [-76.4852, 42.4486],
                [-76.4858, 42.4486],
                [-76.4858, 42.4480],
            ]
        ],
    }
    zones[0]["zone_label"] = "Synthetic smaller lawn"
    edited = api_client.put(
        url,
        headers={"If-Match": etag},
        json={
            "zones": zones,
            "change_note": "Deliberate shrink; preserve historical attribution",
        },
    )
    assert edited.status_code == 200, edited.text
    published = api_client.post(
        url + "/publish",
        headers={"If-Match": edited.headers["etag"]},
        json={
            "request_id": str(uuid4()),
            "expected_current_package_id": str(site.package_id),
        },
    )
    assert published.status_code == 201, published.text
    package = document(published.content)["package"]
    assert isinstance(package, dict)
    successor = UUID(str(package["package_id"]))
    assert package["package_version"] == 2
    analysis = f"{site.project_url}/observations"
    point, inventory, current = uuid4(), uuid4(), uuid4()
    payload: dict[str, JsonValue] = {
        "site_id": str(site.tenant.site),
        "package_id": str(site.package_id),
        "zone_id": str(zone.zone_id),
        "form_version": bindings.play.form_version,
        "round_type": "standard",
        "first_round": True,
        "placement": "hand",
        "coordinates": [-76.4860, 42.4482],
        "observer": "QA",
        "observed_at": "2026-10-10T12:00:00Z",
        "answers": {"people": 3, "notes": "Synthetic late map-v1 record"},
    }
    inventory_payload = {
        key: value for key, value in payload.items() if key not in {"coordinates", "first_round"}
    } | {
        "round_type": "inventory",
        "placement": "zone",
        "form_version": bindings.inventory.form_version,
        "answers": {"notes": "Synthetic delayed whole-zone Inventory"},
    }
    # When offline records for v1 arrive after v2, then reads keep their recorded snapshot.
    sign_in(api_client, signer, site.tenant.users["observer"])
    for identifier, body in (
        (point, payload),
        (inventory, inventory_payload),
        (
            current,
            payload | {"package_id": str(successor), "coordinates": [-76.4855, 42.4482]},
        ),
    ):
        response = api_client.put(f"{analysis}/{identifier}", json=body)
        assert response.status_code == 200, response.text
    sign_in(api_client, signer, site.tenant.users["viewer"])
    response = api_client.get(analysis, params={"site_id": str(site.tenant.site)})
    assert response.status_code == 200, response.text
    page = ObservationPage.model_validate_json(response.content)
    assert page.total_matching == 3
    by_id = {row.observation_id: row for row in page.items}
    assert by_id[point].package_version == 1
    assert by_id[point].zone_label == zone.zone_label
    assert by_id[inventory].geometry is None
    assert by_id[current].package_version == 2
    assert by_id[current].zone_label == "Synthetic smaller lawn"
    assert_gis_and_export_agree(api_client, site, page, inventory, tmp_path)
    assert_prepared_layers(tmp_path, site, page, point, inventory, current)


def assert_gis_and_export_agree(
    api_client: TestClient, site: ZoneSite, page: ObservationPage, inventory: UUID, output: Path
) -> None:
    by_id = {row.observation_id: row for row in page.items}
    analysis = f"{site.project_url}/observations"
    sql = admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; "
        "SELECT set_config('fieldmaps.user_id', :'viewer', true); "
        "SELECT jsonb_agg(to_jsonb(r) ORDER BY observation_id) FROM gis.recorded_observations r "
        "WHERE site_id=:'site'; ROLLBACK;",
        *site.tenant.variables(),
        f"viewer={site.tenant.users['viewer']}",
    )
    rows = TypeAdapter(list[RecordedZone]).validate_json(sql.splitlines()[-1])
    (output / "sql-readback.json").write_text(
        TypeAdapter(list[RecordedZone]).dump_json(rows, indent=2).decode() + "\n"
    )
    assert len(rows) == 3
    for row in rows:
        recorded = by_id[row.observation_id]
        assert (
            row.package_id,
            row.package_version,
            row.zone_id,
            row.zone_code,
            row.zone_label_at_capture,
        ) == (
            recorded.package_id,
            recorded.package_version,
            recorded.zone_id,
            recorded.zone_code,
            recorded.zone_label,
        )
        assert row.round_type == recorded.round_type
    for format_name in ("csv", "geojson"):
        exported = api_client.get(
            analysis + "/export",
            params={
                "site_id": str(site.tenant.site),
                "format": format_name,
            },
        )
        assert exported.status_code == 200, exported.text
        (output / f"{format_name}.zip").write_bytes(exported.content)
        bundle = files(exported.content)
        historical = document(bundle["historical-zones.geojson"])["features"]
        assert isinstance(historical, list)
        assert len(historical) == 2
        if format_name == "csv":
            csv_rows = list(
                csv.DictReader(StringIO(bundle["observations.csv"].decode("utf-8-sig")))
            )
            assert {UUID(row["observation_id"]) for row in csv_rows} == set(by_id)
            inventory_row = next(row for row in csv_rows if row["observation_id"] == str(inventory))
            assert inventory_row["longitude"] == inventory_row["latitude"] == ""
        else:
            events = document(bundle["observations.geojson"])["features"]
            assert isinstance(events, list)
            assert len(events) == 3
            event = next(
                feature
                for feature in events
                if isinstance(feature, dict) and feature["id"] == str(inventory)
            )
            assert isinstance(event, dict)
            assert event["geometry"] is None
            assert_export_geometry_matches_gis(site, bundle)


def assert_export_geometry_matches_gis(site: ZoneSite, bundle: dict[str, bytes]) -> None:
    result = admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; "
        "SELECT set_config('fieldmaps.user_id', :'viewer', true); "
        "WITH event AS (SELECT value FROM "
        "jsonb_array_elements(:'events'::jsonb->'features')), "
        "snapshot AS (SELECT value FROM "
        "jsonb_array_elements(:'zones'::jsonb->'features')) "
        "SELECT jsonb_build_object("
        "'point_count',(SELECT count(*) FROM gis.point_events WHERE site_id=:'site'),"
        "'inventory_count',(SELECT count(*) FROM gis.inventory_records WHERE site_id=:'site'),"
        "'snapshot_count',(SELECT count(*) FROM gis.zone_snapshots WHERE site_id=:'site'),"
        "'points_match',(SELECT bool_and(extensions.ST_Equals(p.geom,"
        "extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((e.value->'geometry')::text),4326))) "
        "FROM gis.point_events p JOIN event e ON p.observation_id=(e.value->>'id')::uuid "
        "WHERE p.site_id=:'site'),"
        "'snapshots_match',(SELECT bool_and(extensions.ST_Equals(z.geom,"
        "extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON((s.value->'geometry')::text),4326))) "
        "FROM gis.zone_snapshots z JOIN snapshot s ON z.snapshot_key=s.value->>'id' "
        "WHERE z.site_id=:'site'),"
        "'delayed_inside_recorded',(SELECT bool_and(extensions.ST_Covers(z.geom,p.geom)) "
        "FROM gis.point_events p JOIN gis.zone_snapshots z "
        "ON (z.package_id,z.zone_id)=(p.package_id,p.zone_id) "
        "WHERE p.site_id=:'site' AND p.package_version=1),"
        "'delayed_outside_successor',(SELECT bool_and(NOT extensions.ST_Intersects(z.geom,p.geom)) "
        "FROM gis.point_events p JOIN gis.zone_snapshots z ON z.zone_id=p.zone_id "
        "AND z.package_version=2 WHERE p.site_id=:'site' AND p.package_version=1)); ROLLBACK;",
        *site.tenant.variables(),
        f"viewer={site.tenant.users['viewer']}",
        f"events={bundle['observations.geojson'].decode()}",
        f"zones={bundle['historical-zones.geojson'].decode()}",
    )
    checks = document(result.splitlines()[-1].encode())
    assert checks == {
        "point_count": 2,
        "inventory_count": 1,
        "snapshot_count": 2,
        "points_match": True,
        "snapshots_match": True,
        "delayed_inside_recorded": True,
        "delayed_outside_successor": True,
    }


def assert_prepared_layers(  # noqa: PLR0913, PLR0917 - explicit synthetic identities.
    output: Path,
    site: ZoneSite,
    page: ObservationPage,
    delayed: UUID,
    inventory: UUID,
    current: UUID,
) -> None:
    prepared = output / "analysis"
    conversion = subprocess.run(  # noqa: S603 - repository CLI and synthetic local paths only.
        [
            sys.executable,
            str(ROOT / "qgis/zone-boundaries/prepare.py"),
            str(output / "geojson.zip"),
            str(prepared),
            "--csv-zip",
            str(output / "csv.zip"),
        ],
        check=False,
        capture_output=True,
        text=True,
        env={},
        timeout=10,
    )
    assert conversion.returncode == 0, conversion.stdout + conversion.stderr
    checks = document((prepared / "projection-checks.json").read_bytes())
    assert checks["total_matching"] == 3
    assert checks["point_event_count"] == 2
    assert checks["inventory_record_count"] == checks["inventory_polygon_count"] == 1
    assert checks["historical_snapshot_count"] == 2
    assert checks["csv_geojson_scope_and_identity_agree"] is True
    events = prepared_features(prepared, "all-events.geojson")
    points = prepared_features(prepared, "point-events.geojson")
    inventories = prepared_features(prepared, "inventory-records.geojson")
    snapshots = prepared_features(prepared, "historical-zones.geojson")
    assert set(events) == {str(delayed), str(inventory), str(current)}
    assert set(points) == {str(delayed), str(current)}
    assert set(inventories) == {str(inventory)}
    assert (prepared / "all-events.geojson").read_bytes() == files(
        (output / "geojson.zip").read_bytes()
    )["observations.geojson"]
    assert events[str(inventory)]["geometry"] is None
    assert points[str(delayed)]["geometry"] == {"type": "Point", "coordinates": [-76.4860, 42.4482]}
    by_id = {str(row.observation_id): row for row in page.items}
    for identifier, event in (events | points | inventories).items():
        props = event["properties"]
        assert isinstance(props, dict)
        recorded = by_id[identifier]
        assert props["package_id"] == str(recorded.package_id)
        assert props["map_version"] == recorded.package_version
        assert props["zone_id"] == str(recorded.zone_id)
        assert props["zone_code"] == recorded.zone_code
        assert props["zone_label_at_capture"] == recorded.zone_label
        assert "assignment_basis" not in props
        assert "display_anchor_basis" not in props
    old = by_id[str(inventory)]
    old_key = f"{site.package_id}:{old.zone_id}"
    assert inventories[str(inventory)]["geometry"] == snapshots[old_key]["geometry"]
    historical = snapshots[old_key]["geometry"]
    assert isinstance(historical, dict)
    assert historical["type"] == "MultiPolygon"
    coordinates = historical["coordinates"]
    assert isinstance(coordinates, list)
    assert len(coordinates) == 2
    (output / "acceptance-context.json").write_text(
        json.dumps(
            {
                "delayed_point": str(delayed),
                "inventory": str(inventory),
                "current_point": str(current),
                "historical_version": 1,
                "current_version": 2,
                "historical_snapshot": old_key,
            },
            indent=2,
        )
        + "\n"
    )


def prepared_features(directory: Path, name: str) -> dict[str, dict[str, JsonValue]]:
    entries = document((directory / name).read_bytes())["features"]
    assert isinstance(entries, list)
    result: dict[str, dict[str, JsonValue]] = {}
    for feature in entries:
        assert isinstance(feature, dict)
        assert isinstance(feature["id"], str)
        result[feature["id"]] = feature
    assert len(result) == len(entries)
    return result
