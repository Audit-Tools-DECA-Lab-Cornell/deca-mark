from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue

from fieldmaps_api.observation_analysis_schemas import HistoricalObservationDetail
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, create_package, create_tenant, sign_in
from tests.test_zone_form_succession import published_form, successor_body
from tests.zone_api_fixtures import ZoneSite, clean_zone_tenant, document, publish_draft

pytestmark = pytest.mark.integration


@pytest.mark.parametrize("round_type", ["standard", "reliability"])
def test_boundary_point_is_covered_for_both_play_rounds(
    api_client: TestClient, bound_site: BoundSite, round_type: str
) -> None:
    # Given: a point lies exactly on the published zone's east edge.
    payload = bound_site.point(coordinates=[-76.485, 42.448], round_type=round_type)
    # When: that point is uploaded.
    response = api_client.put(bound_site.url(uuid4()), json=payload)
    # Then: inclusive ST_Covers semantics accept it.
    assert response.status_code == 200, response.text


@pytest.mark.parametrize(
    ("field", "value", "issue"),
    [
        ("coordinates", [0, 0], "point_outside_zone"),
        ("site_id", str(uuid4()), "package_not_in_site"),
        ("zone_id", str(uuid4()), "zone_not_in_package"),
        ("form_version", "missing-synthetic", "form_not_in_package"),
    ],
)
def test_invalid_binding_is_rejected_without_inserting(
    api_client: TestClient, bound_site: BoundSite, field: str, value: JsonValue, issue: str
) -> None:
    # Given: a bound upload has one incompatible binding field.
    observation = uuid4()
    payload = bound_site.point(**{field: value})
    # When: the incompatible binding is uploaded.
    response = api_client.put(bound_site.url(observation), json=payload)
    # Then: an actionable issue is returned and no observation is stored.
    assert response.status_code == 422, response.text
    assert issue in response.text
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.observations WHERE id=:'id';", f"id={observation}"
        )
        == "0"
    )


def test_cross_site_package_is_rejected_with_binding_issue(
    api_client: TestClient, bound_site: BoundSite
) -> None:
    # Given: the project contains another accessible site.
    second = uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name) "
        "VALUES(:'second',:'org',:'project','synthetic-second','Synthetic second site');",
        *bound_site.site.tenant.variables(),
        f"second={second}",
    )
    # When: the first site's package is bound to the second site's UUID.
    result = api_client.put(bound_site.url(uuid4()), json=bound_site.point(site_id=str(second)))
    # Then: the accessible cross-site mismatch is actionable.
    assert result.status_code == 422, result.text
    assert "package_not_in_site" in result.text


def test_hidden_other_tenant_package_returns_not_found(
    api_client: TestClient, bound_site: BoundSite, signer: Signer
) -> None:
    # Given: a different tenant has its own published package.
    other = Tenant.new()
    create_tenant(other)
    try:
        legacy = create_package(api_client, signer, other)
        package = publish_draft(api_client, ZoneSite(other, legacy))["package_id"]
        sign_in(api_client, signer, bound_site.site.tenant.users["manager"])
        # When: the first tenant references that hidden package.
        result = api_client.put(
            bound_site.url(uuid4()),
            json=bound_site.point(package_id=package, site_id=str(other.site)),
        )
        # Then: neither its existence nor binding identities are disclosed.
        assert result.status_code == 404, result.text
        assert document(result.content)["error"] == {
            "code": "not_found",
            "message": "Package not found",
            "details": {},
        }
    finally:
        clean_zone_tenant(other)


def test_late_upload_uses_retired_form_and_superseded_package(
    api_client: TestClient, bound_site: BoundSite, signer: Signer
) -> None:
    # Given: the original package's form is retired after a successor adopts a different form.
    site = bound_site.site
    play = published_form(api_client, site, "synthetic-successor")
    successor = successor_body(api_client, site, {"package_id": str(bound_site.package)}, play)
    published = api_client.post(f"{site.project_url}/packages", json=successor)
    assert published.status_code == 201, published.text
    retired = api_client.post(f"{site.project_url}/form-versions/shell-v1/retire")
    assert retired.status_code == 200, retired.text
    archived = api_client.patch(site.project_url, json={"status": "archived"})
    assert archived.status_code == 200, archived.text
    sign_in(api_client, signer, site.tenant.users["observer"])
    # When: the collector uploads the original offline package/form context.
    response = api_client.put(bound_site.url(uuid4()), json=bound_site.point())
    # Then: historic provenance survives successor publication, retirement and archival.
    assert response.status_code == 200, response.text
    assert document(response.content)["package_id"] == str(bound_site.package)


def test_inventory_uses_explicit_package_role_and_projects_its_zone_anchor(
    api_client: TestClient, bound_site: BoundSite
) -> None:
    # Given: a form without an inventory prefix is pinned to the inventory role.
    site = bound_site.site
    inventory = published_form(api_client, site, "synthetic-count")
    body = successor_body(api_client, site, {"package_id": str(bound_site.package)}, "shell-v1")
    body["inventory_form_version"] = inventory
    prepared = api_client.post(f"{site.project_url}/packages", json=body)
    assert prepared.status_code == 201, prepared.text
    package = str(Publication.model_validate_json(prepared.content).package.package_id)
    payload = bound_site.point(
        package_id=package,
        form_version=inventory,
        round_type="inventory",
        placement="zone",
        answers={"notes": "Synthetic zone inventory"},
    )
    del payload["coordinates"]
    del payload["first_round"]
    observation = uuid4()
    # When: inventory is uploaded without point-event fields.
    response = api_client.put(bound_site.url(observation), json=payload)
    # Then: its compatibility point is the immutable zone anchor, with zone semantics.
    assert response.status_code == 200, response.text
    stored = admin_sql(
        "SELECT o.round_type || ':' || o.placement_source || ':' || "
        "(o.first_round IS NULL)::text || ':' || (o.geom IS NULL)::text "
        "FROM fieldmaps.observations o JOIN fieldmaps.package_zones z ON z.package_id=o.package_id "
        "AND z.zone_id=o.zone_id WHERE o.id=:'id';",
        f"id={observation}",
    )
    assert stored == "inventory:zone:true:true"
    detail = api_client.get(f"/v1/projects/{site.tenant.project}/observations/{observation}")
    assert detail.status_code == 200, detail.text
    historical = HistoricalObservationDetail.model_validate_json(detail.content)
    assert historical.geometry is None
    assert historical.display_anchor is not None
    zone_history = api_client.get(f"{site.url}/zones", params={"package_id": package})
    assert zone_history.status_code == 200, zone_history.text
    zones = HistoricalZones.model_validate_json(zone_history.content)
    assert historical.display_anchor.coordinates == zones.zones[0].display_anchor


def test_revoked_observer_cannot_replay_a_previous_receipt(
    api_client: TestClient, bound_site: BoundSite, signer: Signer
) -> None:
    # Given: a receipt exists and its collector's project membership is revoked.
    tenant = bound_site.site.tenant
    observer = tenant.users["observer"]
    sign_in(api_client, signer, observer)
    url = bound_site.url(uuid4())
    assert api_client.put(url, json=bound_site.point()).status_code == 200
    sign_in(api_client, signer, tenant.users["manager"])
    removed = api_client.delete(f"/v1/projects/{tenant.project}/members/{observer}")
    assert removed.status_code == 204, removed.text
    sign_in(api_client, signer, observer)
    # When: the revoked observer retries their unchanged captured record.
    response = api_client.put(url, json=bound_site.point())
    # Then: current authorization takes precedence over receipt recognition.
    assert response.status_code == 403, response.text
