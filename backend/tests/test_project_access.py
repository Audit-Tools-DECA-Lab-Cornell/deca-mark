from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from tests.signing import OUTSIDER, PROJECT, VIEWER, Signer
from tests.tenant_fixtures import observation_payload

pytestmark = pytest.mark.integration


def test_unassigned_user_cannot_read_or_upload(api_client: TestClient, signer: Signer) -> None:
    api_client.headers["Authorization"] = f"Bearer {signer.issue(OUTSIDER)}"
    url = f"/v1/projects/{PROJECT}/observations/{uuid4()}"
    assert api_client.get(url).status_code == 404
    response = api_client.put(
        url,
        json=observation_payload(),
    )
    assert response.status_code in {403, 404}
    assert api_client.get("/v1/projects").text == "[]"


def test_viewer_cannot_upload(api_client: TestClient, signer: Signer) -> None:
    api_client.headers["Authorization"] = f"Bearer {signer.issue(VIEWER)}"
    response = api_client.put(
        f"/v1/projects/{PROJECT}/observations/{uuid4()}",
        json=observation_payload(),
    )
    assert response.status_code == 403


def test_pooled_connection_does_not_retain_previous_user(
    api_client: TestClient, signer: Signer
) -> None:
    assert api_client.get("/v1/projects").text != "[]"
    api_client.headers["Authorization"] = f"Bearer {signer.issue(OUTSIDER)}"
    for _ in range(8):
        response = api_client.get("/v1/projects")
        assert response.status_code == 200
        assert response.text == "[]"
