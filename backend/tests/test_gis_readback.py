from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.local_database import admin_sql
from tests.package_fixtures import submission
from tests.signing import MANAGER, PROJECT, USER, Signer
from tests.tenant_fixtures import observation_payload, sign_in

pytestmark = pytest.mark.integration


def read_as_gis(observation_id: UUID) -> tuple[float, float, int, str]:
    result = admin_sql(
        "BEGIN; GRANT fieldmaps_sample_reader TO postgres WITH SET TRUE; "
        "SET LOCAL ROLE fieldmaps_sample_reader; "
        "SELECT json_build_array(longitude, latitude, people, notes)::text "
        "FROM gis.sample_observations WHERE observation_id = :'observation_id'; ROLLBACK;",
        f"observation_id={observation_id}",
    )
    return TypeAdapter(tuple[float, float, int, str]).validate_json(result)


def test_committed_upload_is_immediately_visible_through_restricted_gis_view(
    api_client: TestClient, signer: Signer
) -> None:
    site_id = uuid4()
    observation_id = uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name) "
        "VALUES(:'site','10000000-0000-4000-8000-000000000001',:'project',:'code',"
        "'Synthetic GIS readback site');",
        f"site={site_id}",
        f"project={PROJECT}",
        f"code=gis-{site_id.hex}",
    )
    try:
        api_client.headers["Authorization"] = f"Bearer {signer.issue(MANAGER)}"
        package = api_client.post(
            f"/v1/projects/{PROJECT}/packages", json=submission(site_id=str(site_id))
        )
        assert package.status_code == 201, package.text
        package_id = Publication.model_validate_json(package.content).package.package_id
        historical = api_client.get(
            f"/v1/projects/{PROJECT}/sites/{site_id}/zones",
            params={"package_id": str(package_id)},
        )
        assert historical.status_code == 200, historical.text
        zone_id = HistoricalZones.model_validate_json(historical.content).zones[0].zone_id
        sign_in(api_client, signer, USER)
        payload = observation_payload(site_id, package_id, zone_id)
        payload["answers"] = {"people": 3, "notes": "GIS readback"}
        response = api_client.put(
            f"/v1/projects/{PROJECT}/observations/{observation_id}", json=payload
        )
        assert response.status_code == 200, response.text
        assert read_as_gis(observation_id) == (-76.485, 42.448, 3, "GIS readback")
    finally:
        admin_sql(
            "BEGIN; SET LOCAL session_replication_role=replica; "
            "DELETE FROM fieldmaps.observations WHERE id=:'observation'; "
            "DELETE FROM fieldmaps.package_checks WHERE package_id IN "
            "(SELECT id FROM fieldmaps.site_packages WHERE site_id=:'site'); "
            "DELETE FROM fieldmaps.package_zones WHERE site_id=:'site'; "
            "DELETE FROM fieldmaps.zone_publications WHERE site_id=:'site'; "
            "DELETE FROM fieldmaps.zone_drafts WHERE site_id=:'site'; "
            "DELETE FROM fieldmaps.site_zone_state WHERE site_id=:'site'; "
            "DELETE FROM fieldmaps.site_packages WHERE site_id=:'site'; "
            "DELETE FROM fieldmaps.zone_identities WHERE site_id=:'site'; "
            "DELETE FROM fieldmaps.sites WHERE id=:'site'; COMMIT;",
            f"observation={observation_id}",
            f"site={site_id}",
        )
