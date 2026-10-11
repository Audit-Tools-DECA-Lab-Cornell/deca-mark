from typing import Literal, assert_never
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.zone_observation_schemas import BoundUploadReceipt
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql
from tests.signing import Signer
from tests.tenant_fixtures import observation_payload, sign_in
from tests.zone_api_fixtures import ZoneSite, publish_draft

pytestmark = pytest.mark.integration


def test_bound_point_commits_binding_and_replays_original_receipt(
    api_client: TestClient, bound_site: BoundSite, signer: Signer
) -> None:
    # Given: a collector has a published immutable package.
    observer = bound_site.site.tenant.users["observer"]
    sign_in(api_client, signer, observer)
    observation = uuid4()
    url = bound_site.url(observation)
    payload = bound_site.point()
    # When: the same captured record is uploaded twice.
    first = api_client.put(url, json=payload)
    second = api_client.put(url, json=payload)
    # Then: one committed record produces the same bound receipt.
    assert first.status_code == 200, first.text
    assert second.content == first.content, second.text
    receipt = BoundUploadReceipt.model_validate_json(first.content)
    assert (receipt.package_id, receipt.zone_id, receipt.user_id) == (
        bound_site.package,
        bound_site.zone,
        observer,
    )
    stored = admin_sql(
        "SELECT upload_protocol || ':' || upload_hash_version || ':' || zone_code "
        "FROM fieldmaps.observations WHERE id=:'id';",
        f"id={observation}",
    )
    assert stored == "2:zone-upload-v2-jcs-1:A"


def test_equivalent_canonical_retry_returns_original_receipt(
    api_client: TestClient, bound_site: BoundSite
) -> None:
    # Given: a committed bound record with integer answers.
    url = bound_site.url(uuid4())
    payload = bound_site.point()
    first = api_client.put(url, json=payload)
    assert first.status_code == 200, first.text
    retry = dict(reversed(list(payload.items()))) | {
        "observer": "  QA  ",
        "observed_at": "2026-10-10T08:00:00-04:00",
        "answers": {"notes": "Synthetic offline café", "people": 3.0},
    }
    # When: key ordering, observer padding and timezone notation change.
    result = api_client.put(url, json=retry)
    # Then: equivalent canonical content returns the original receipt.
    assert (result.status_code, result.content) == (200, first.content)


def test_changed_replay_conflicts_before_mutable_binding_validation(
    api_client: TestClient, bound_site: BoundSite
) -> None:
    # Given: an existing record bound to the published form.
    url = bound_site.url(uuid4())
    payload = bound_site.point()
    assert api_client.put(url, json=payload).status_code == 200
    # When: a retry supplies a nonexistent form.
    response = api_client.put(url, json=payload | {"form_version": "missing-synthetic-form"})
    # Then: the UUID conflict takes precedence over mutable form resolution.
    assert response.status_code == 409, response.text


@pytest.mark.parametrize("first_protocol", ["v1", "v2"])
def test_protocols_cannot_claim_each_others_uuid(
    api_client: TestClient,
    bound_site: BoundSite,
    first_protocol: Literal["v1", "v2"],
) -> None:
    # Given: one protocol has committed this UUID.
    observation = uuid4()
    v2 = bound_site.url(observation)
    v1 = v2.replace("/v2/", "/v1/")
    match first_protocol:
        case "v1":
            assert api_client.put(v1, json=observation_payload()).status_code == 200
        case "v2":
            assert api_client.put(v2, json=bound_site.point()).status_code == 200
        case _:
            assert_never(first_protocol)
    # When: the other protocol attempts to use the same UUID.
    match first_protocol:
        case "v1":
            response = api_client.put(v2, json=bound_site.point())
        case "v2":
            response = api_client.put(v1, json=observation_payload())
        case _:
            assert_never(first_protocol)
    # Then: neither protocol returns the other's receipt.
    assert response.status_code == 409, response.text


def test_v1_lost_receipt_survives_site_code_change(
    api_client: TestClient, bound_site: BoundSite
) -> None:
    # Given: a committed legacy record and a subsequently renamed site code.
    url = bound_site.url(uuid4()).replace("/v2/", "/v1/")
    payload = observation_payload()
    first = api_client.put(url, json=payload)
    assert first.status_code == 200, first.text
    admin_sql(
        "UPDATE fieldmaps.sites SET code='renamed-synthetic' WHERE id=:'site';",
        *bound_site.site.tenant.variables(),
    )
    # When: a lost-response retry keeps its original v1 bytes.
    replay = api_client.put(url, json=payload)
    # Then: receipt recognition precedes resolving the renamed site.
    assert (replay.status_code, replay.content) == (200, first.content)


def test_current_owner_cannot_claim_another_collectors_receipt(
    api_client: TestClient, bound_site: BoundSite, signer: Signer
) -> None:
    # Given: one observer has committed an upload.
    tenant = bound_site.site.tenant
    sign_in(api_client, signer, tenant.users["observer"])
    url = bound_site.url(uuid4())
    assert api_client.put(url, json=bound_site.point()).status_code == 200
    sign_in(api_client, signer, tenant.users["manager"])
    # When: a different authorized owner retries the same payload and UUID.
    replay = api_client.put(url, json=bound_site.point())
    # Then: receipt ownership remains immutable.
    assert replay.status_code == 409, replay.text


def test_v1_lost_receipt_issued_before_site_adoption_replays_after_adoption(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    # Given: a v1 receipt was committed while the site still used its legacy package.
    observation = uuid4()
    url = f"{zone_site.project_url}/observations/{observation}"
    payload = observation_payload()
    original = api_client.put(url, json=payload)
    assert original.status_code == 200, original.text
    publish_draft(api_client, zone_site)
    # When: the response-lost v1 record is retried unchanged after format-2 adoption.
    replay = api_client.put(url, json=payload)
    # Then: the original protocol, timestamp and receipt body remain unchanged.
    assert (replay.status_code, replay.content) == (200, original.content)
