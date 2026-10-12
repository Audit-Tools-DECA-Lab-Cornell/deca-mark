from dataclasses import dataclass
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue

from fieldmaps_api.zone_response_schemas import HistoricalZones
from tests.zone_api_fixtures import ZoneSite, publish_draft


@dataclass(frozen=True, slots=True)
class BoundSite:
    site: ZoneSite
    package: UUID
    zone: UUID

    def url(self, observation: UUID) -> str:
        return f"/v1/projects/{self.site.tenant.project}/observations/{observation}"

    def point(self, **overrides: JsonValue) -> dict[str, JsonValue]:
        payload: dict[str, JsonValue] = {
            "site_id": str(self.site.tenant.site),
            "package_id": str(self.package),
            "zone_id": str(self.zone),
            "form_version": "shell-v1",
            "round_type": "standard",
            "first_round": True,
            "placement": "hand",
            "coordinates": [-76.4857, 42.4482],
            "observer": "QA",
            "observed_at": "2026-10-10T12:00:00Z",
            "answers": {"people": 3, "notes": "Synthetic offline café"},
        }
        return payload | overrides


@pytest.fixture
def bound_site(api_client: TestClient, zone_site: ZoneSite) -> BoundSite:
    package = UUID(str(publish_draft(api_client, zone_site)["package_id"]))
    response = api_client.get(f"{zone_site.url}/zones", params={"package_id": str(package)})
    assert response.status_code == 200, response.text
    history = HistoricalZones.model_validate_json(response.content)
    return BoundSite(ZoneSite(zone_site.tenant, package), package, history.zones[0].zone_id)
