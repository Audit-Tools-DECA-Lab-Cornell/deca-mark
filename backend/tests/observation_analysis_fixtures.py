"""Synthetic historical analysis records only in the guarded disposable rehearsal."""

from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.observation_analysis_schemas import ObservationPage
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql


@dataclass(frozen=True, slots=True)
class AnalysisSite:
    bound: BoundSite
    point: UUID

    @property
    def url(self) -> str:
        return f"/v1/projects/{self.bound.site.tenant.project}/observations"


def seed_copies(site: AnalysisSite, count: int) -> None:
    admin_sql(
        """
INSERT INTO fieldmaps.observations
(id,organization_id,project_id,site_id,form_version_id,observer_code,observed_at,geom,answers,
created_by,upload_hash,round_type,first_round,placement_source,package_id,zone_id)
SELECT gen_random_uuid(),organization_id,project_id,site_id,form_version_id,observer_code,
observed_at,geom,answers,created_by,upload_hash,round_type,first_round,placement_source,
package_id,zone_id
FROM fieldmaps.observations CROSS JOIN generate_series(1,:copies) WHERE id=:'point';
""",
        *site.bound.site.tenant.variables(),
        f"point={site.point}",
        f"copies={count}",
    )


@pytest.fixture
def analysis_site(api_client: TestClient, bound_site: BoundSite) -> AnalysisSite:
    point = uuid4()
    uploaded = api_client.put(bound_site.url(point), json=bound_site.point())
    assert uploaded.status_code == 200, uploaded.text
    return AnalysisSite(bound_site, point)


def read_page(client: TestClient, url: str, **filters: str | int) -> ObservationPage:
    response = client.get(url, params=filters)
    assert response.status_code == 200, response.text
    return ObservationPage.model_validate_json(response.content)
