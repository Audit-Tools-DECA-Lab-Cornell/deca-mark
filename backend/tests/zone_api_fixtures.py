import json
from collections.abc import Iterator
from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter

from tests.local_database import admin_sql
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in
from tests.test_site_packages import submission

JSON_DOCUMENT = TypeAdapter(dict[str, JsonValue])


@dataclass(frozen=True, slots=True)
class ZoneSite:
    tenant: Tenant
    package_id: UUID

    @property
    def project_url(self) -> str:
        return f"/v1/projects/{self.tenant.project}"

    @property
    def url(self) -> str:
        return f"{self.project_url}/sites/{self.tenant.site}"

    @property
    def drafts(self) -> str:
        return f"{self.url}/zone-drafts"


def document(content: bytes) -> dict[str, JsonValue]:
    return JSON_DOCUMENT.validate_json(content)


def clean_zone_tenant(tenant: Tenant) -> None:
    admin_sql(
        "BEGIN; SET LOCAL session_replication_role=replica; "
        "DELETE FROM fieldmaps.site_zone_state WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.zone_publications WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.zone_drafts WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.package_zones WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.zone_identities WHERE organization_id=:'org'; COMMIT;",
        *tenant.variables(),
    )
    cleanup_tenant(tenant)


@pytest.fixture
def zone_site(api_client: TestClient, signer: Signer) -> Iterator[ZoneSite]:
    tenant = Tenant.new()
    create_tenant(tenant)
    sign_in(api_client, signer, tenant.users["manager"])
    try:
        source = JSON_DOCUMENT.validate_python(submission())
        layers = source["layers"]
        assert isinstance(layers, dict)
        layers["paths"] = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"id": "retained-path"},
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-76.4857, 42.4481], [-76.4854, 42.4484]],
                    },
                }
            ],
        }
        layers["trees"] = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {"id": "retained-tree"},
                    "geometry": {"type": "Point", "coordinates": [-76.4856, 42.4482]},
                }
            ],
        }
        created = api_client.post(f"/v1/projects/{tenant.project}/packages", json=source)
        assert created.status_code == 201, created.text
        result = document(created.content)
        yield ZoneSite(tenant, UUID(str(result["package_id"])))
    finally:
        clean_zone_tenant(tenant)


def create_draft(client: TestClient, site: ZoneSite) -> tuple[str, str, dict[str, JsonValue]]:
    result = client.post(
        site.drafts,
        json={"request_id": str(uuid4()), "base_package_id": str(site.package_id)},
    )
    assert result.status_code == 201, result.text
    data = document(result.content)
    return f"{site.drafts}/{data['draft_id']}", result.headers["etag"], data


def publish_draft(client: TestClient, site: ZoneSite) -> dict[str, JsonValue]:
    url, etag, _draft = create_draft(client, site)
    result = client.post(
        f"{url}/publish",
        headers={"If-Match": etag},
        json={"request_id": str(uuid4()), "expected_current_package_id": str(site.package_id)},
    )
    assert result.status_code == 201, result.text
    package = document(result.content)["package"]
    assert isinstance(package, dict)
    return package


def zone_rows(tenant: Tenant) -> str:
    return admin_sql(
        "SELECT jsonb_agg(jsonb_build_object('zone_id',zone_id,'geometry',canonical_geometry,"
        "'digest',geometry_sha256,'anchor',jsonb_build_array("
        "extensions.ST_X(display_anchor),extensions.ST_Y(display_anchor)))) "
        "FROM fieldmaps.package_zones WHERE project_id=:'project';",
        *tenant.variables(),
    )


def snapshot_history(tenant: Tenant) -> str:
    return admin_sql(
        "SELECT row_to_json(o) FROM fieldmaps.observations o WHERE id=:'observation';",
        *tenant.variables(),
    )


def zones_body(data: dict[str, JsonValue], *, label: str = "Renamed lawn") -> str:
    zones = data["zones"]
    assert isinstance(zones, list)
    for zone in zones:
        assert isinstance(zone, dict)
        zone["zone_label"] = label
    return json.dumps({"zones": zones, "change_note": "Deliberate boundary revision"})
