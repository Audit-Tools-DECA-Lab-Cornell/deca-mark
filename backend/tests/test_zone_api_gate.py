from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.config import Settings
from fieldmaps_api.main import create_app
from tests.local_database import database_url, password_file
from tests.signing import ISSUER, Signer
from tests.zone_api_fixtures import ZoneSite, create_draft, document

pytestmark = pytest.mark.integration


def test_disabled_publication_retains_draft_and_reports_no_editing_capability(
    api_client: TestClient, signer: Signer, zone_site: ZoneSite
) -> None:
    url, etag, initial = create_draft(api_client, zone_site)
    settings = Settings(database_url=database_url(), database_password_file=password_file())
    with TestClient(
        create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))
    ) as disabled:
        disabled.headers["Authorization"] = api_client.headers["Authorization"]
        refused = disabled.post(
            url + "/publish",
            headers={"If-Match": etag},
            json={
                "request_id": str(uuid4()),
                "expected_current_package_id": str(zone_site.package_id),
            },
        )
        assert refused.status_code == 503, refused.text
        assert "unsupported_operation" in refused.text
        sites = disabled.get(f"/v2/projects/{zone_site.tenant.project}/sites")
        assert sites.status_code == 200, sites.text
        assert '"zone_editing_available":false' in sites.text
    retained = api_client.get(url)
    assert document(retained.content)["state"] == "draft"
    assert document(retained.content)["revision"] == initial["revision"]


def test_disabling_new_publication_keeps_original_success_replay_available(
    api_client: TestClient, signer: Signer, zone_site: ZoneSite
) -> None:
    url, etag, _draft = create_draft(api_client, zone_site)
    body = {"request_id": str(uuid4()), "expected_current_package_id": str(zone_site.package_id)}
    first = api_client.post(url + "/publish", headers={"If-Match": etag}, json=body)
    assert first.status_code == 201, first.text
    settings = Settings(database_url=database_url(), database_password_file=password_file())
    with TestClient(
        create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))
    ) as disabled:
        disabled.headers["Authorization"] = api_client.headers["Authorization"]
        replay = disabled.post(url + "/publish", headers={"If-Match": etag}, json=body)
        assert replay.status_code == 200, replay.text
        assert replay.content == first.content
