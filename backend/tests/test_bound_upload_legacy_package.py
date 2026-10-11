from uuid import uuid4

import pytest

from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.zone_error_details import SafeZoneDetails
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import ZoneSite

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_zone_api_live",)


def test_legacy_ready_package_with_empty_manifest_is_rejected_without_insert(
    live_api: LiveApi,
) -> None:
    # Given: a DB-valid legacy ready package has no format or zone-contract metadata.
    package = uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.site_packages(id,organization_id,project_id,site_id,"
        "form_version_id,version,state,manifest,archive,archive_sha256,prepared_by) "
        "VALUES(:'package',:'org',:'project',:'site',:'form',1,'ready','{}',decode('00','hex'),"
        "encode(sha256(decode('00','hex')),'hex'),:'manager');",
        *live_api.tenant.variables(),
        f"package={package}",
        f"manager={live_api.tenant.users['manager']}",
    )
    site = BoundSite(ZoneSite(live_api.tenant, package), package, uuid4())
    observation = uuid4()
    # When: an observer references that legacy package in a bound upload over real HTTP.
    with live_api.client("observer") as collector:
        response = collector.put(site.url(observation), json=site.point())
    # Then: a structured readiness issue is returned and no observation is inserted.
    assert response.status_code == 422, response.text
    error = ErrorEnvelope.model_validate_json(response.content).error
    assert error.code == "validation_failed"
    issues = SafeZoneDetails.model_validate(error.details).issues
    assert [issue.code for issue in issues] == ["package_not_ready"]
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.observations WHERE id=:'id';", f"id={observation}"
        )
        == "0"
    )
