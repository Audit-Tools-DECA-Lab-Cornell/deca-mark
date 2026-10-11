from uuid import UUID, uuid4

import pytest

from fieldmaps_api.schemas import PackageDetail
from fieldmaps_api.zone_response_schemas import Draft, Publication
from tests.bound_upload_fixtures import BoundSite
from tests.test_site_packages import submission
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import ZoneSite

pytest_plugins = ("tests.test_zone_api_live",)


@pytest.fixture
def live_bound_site(live_api: LiveApi) -> BoundSite:
    project = f"/v1/projects/{live_api.tenant.project}"
    drafts = f"{project}/sites/{live_api.tenant.site}/zone-drafts"
    with live_api.client() as client:
        response = client.post(f"{project}/packages", json=submission())
        assert response.status_code == 201, response.text
        legacy = PackageDetail.model_validate_json(response.content)
        created = client.post(
            drafts,
            json={
                "request_id": str(uuid4()),
                "base_package_id": str(legacy.package_id),
            },
        )
        assert created.status_code == 201, created.text
        draft = Draft.model_validate_json(created.content)
        url = f"{drafts}/{draft.draft_id}"
        edited = client.put(
            url,
            headers={"If-Match": created.headers["etag"]},
            json={
                "zones": [zone.model_dump(mode="json") for zone in draft.zones],
                "change_note": "Synthetic HTTP publication for bound uploads",
            },
        )
        assert edited.status_code == 200, edited.text
        validation = client.post(f"{url}/validate", headers={"If-Match": edited.headers["etag"]})
        assert validation.status_code == 200, validation.text
        published = client.post(
            f"{url}/publish",
            headers={"If-Match": edited.headers["etag"]},
            json={
                "request_id": str(uuid4()),
                "expected_current_package_id": str(legacy.package_id),
            },
        )
        assert published.status_code == 201, published.text
        package = Publication.model_validate_json(published.content)
        return BoundSite(
            ZoneSite(live_api.tenant, UUID(str(legacy.package_id))),
            package.package.package_id,
            draft.zones[0].zone_id,
        )
