"""Current-schema GIS/API agreement; executed after BE-22 against disposable PostGIS."""

import csv
from io import StringIO
from typing import ClassVar
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter

from fieldmaps_api.observation_analysis_schemas import ObservationPage
from fieldmaps_api.zone_response_schemas import HistoricalZones, PackageForms
from tests.conftest import signer
from tests.local_database import admin_sql, disposable_database_selected
from tests.signing import Signer
from tests.tenant_fixtures import sign_in
from tests.test_observation_analysis_exports import files
from tests.zone_api_fixtures import ZoneSite, create_draft, document

pytestmark = pytest.mark.integration
__all__ = ["signer"]


class RecordedZone(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    observation_id: UUID
    package_id: UUID
    package_version: int
    zone_id: UUID
    zone_code: str
    zone_label_at_capture: str
    spatial_support: str


def test_v1_v2_gis_readback_matches_signed_exports(
    api_client: TestClient, zone_site: ZoneSite, signer: Signer
) -> None:
    # Given a real first package and a deliberately smaller successor.
    assert disposable_database_selected(), "GIS acceptance requires its disposable database"
    site = zone_site
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
    assert_gis_and_export_agree(api_client, site, page, inventory)


def assert_gis_and_export_agree(
    api_client: TestClient, site: ZoneSite, page: ObservationPage, inventory: UUID
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
    for format_name in ("csv", "geojson"):
        exported = api_client.get(
            analysis + "/export",
            params={
                "site_id": str(site.tenant.site),
                "format": format_name,
            },
        )
        assert exported.status_code == 200, exported.text
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
