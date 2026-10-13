from uuid import uuid4

from fastapi.testclient import TestClient

from fieldmaps_api.zone_response_schemas import HistoricalZones
from tests.local_database import admin_sql
from tests.package_fixtures import submission
from tests.signing import PROJECT, Signer
from tests.zone_api_fixtures import document

SITE = "10000000-0000-4000-8000-000000000003"


def test_org_admin_without_project_membership_can_list_upload_and_prepare(
    api_client: TestClient, signer: Signer
) -> None:
    user = uuid4()
    admin_sql(
        "INSERT INTO auth.users (id, instance_id, aud, role, email) VALUES "
        "(:'user', '00000000-0000-0000-0000-000000000000', 'authenticated', "
        "'authenticated', :'user' || '@test.invalid'); "
        "INSERT INTO fieldmaps.profiles(user_id) VALUES (:'user'); "
        "INSERT INTO fieldmaps.organization_members(organization_id, user_id, role) "
        "VALUES ('10000000-0000-4000-8000-000000000001', :'user', 'admin');",
        f"user={user}",
    )
    try:
        api_client.headers["Authorization"] = f"Bearer {signer.issue(user)}"
        listed = api_client.get("/v1/projects")
        assert listed.status_code == 200
        assert listed.json()[0]["project_id"] == str(PROJECT)
        assert listed.json()[0]["role"] == "manager"
        prepared = api_client.post(
            f"/v1/projects/{PROJECT}/packages", json=submission(site_id=SITE)
        )
        assert prepared.status_code == 201, prepared.text
        package = document(prepared.content)["package"]
        assert isinstance(package, dict)
        historical = api_client.get(
            f"/v1/projects/{PROJECT}/sites/{SITE}/zones",
            params={"package_id": str(package["package_id"])},
        )
        assert historical.status_code == 200, historical.text
        zone = HistoricalZones.model_validate_json(historical.content).zones[0]
        uploaded = api_client.put(
            f"/v1/projects/{PROJECT}/observations/{uuid4()}",
            json={
                "site_id": SITE,
                "package_id": package["package_id"],
                "zone_id": str(zone.zone_id),
                "form_version": "shell-v1",
                "coordinates": [-76.485, 42.448],
                "observer": "QA",
                "round_type": "standard",
                "first_round": True,
                "placement": "hand",
                "answers": {"people": 1, "notes": ""},
                "observed_at": "2026-09-26T12:00:00Z",
            },
        )
        assert uploaded.status_code == 200, uploaded.text
    finally:
        admin_sql("DELETE FROM auth.users WHERE id = :'user';", f"user={user}")
