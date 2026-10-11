from typing import Literal, assert_never
from uuid import uuid4

import pytest

from fieldmaps_api.errors import ErrorEnvelope
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql
from tests.tenant_fixtures import observation_payload
from tests.test_zone_api_live import LiveApi

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.bound_upload_live_fixtures",)


@pytest.mark.parametrize("protocol", ["v1", "v2"])
def test_legacy_row_without_upload_identity_returns_safe_conflict(
    live_api: LiveApi, live_bound_site: BoundSite, protocol: Literal["v1", "v2"]
) -> None:
    # Given: a historical observation legitimately has no authenticated owner or upload hash.
    observation = uuid4()
    variables = (*live_api.tenant.variables(), f"id={observation}")
    admin_sql(
        "INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,"
        "observer_code,observed_at,geom,answers,created_by,upload_hash) "
        "VALUES(:'id',:'org',:'project',:'site',:'form','SYN',now(),"
        'fieldmaps.make_point(-76.4857,42.4482),\'{"people":7,"notes":"Synthetic history"}\','
        "NULL,NULL);",
        *variables,
    )
    snapshot = "SELECT row_to_json(o)::text FROM fieldmaps.observations o WHERE id=:'id';"
    before = admin_sql(snapshot, *variables)
    match protocol:
        case "v1":
            url = live_bound_site.url(observation).replace("/v2/", "/v1/")
            payload = observation_payload()
        case "v2":
            url = live_bound_site.url(observation)
            payload = live_bound_site.point()
        case _:
            assert_never(protocol)
    # When: an authenticated upload attempts to claim that historical UUID.
    with live_api.client() as uploader:
        response = uploader.put(url, json=payload)
    # Then: both protocols return a safe conflict and preserve every original row field.
    assert response.status_code == 409, response.text
    assert ErrorEnvelope.model_validate_json(response.content).error.code == "conflict"
    assert admin_sql(snapshot, *variables) == before
