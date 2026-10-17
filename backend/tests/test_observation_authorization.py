"""Signed requests and real runtime-role SQL must agree on immutable creator scope."""

from collections.abc import Iterator
from dataclasses import dataclass
from typing import TYPE_CHECKING, cast
from uuid import UUID, uuid4

import anyio
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from fieldmaps_api.deps import user_transaction
from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.observation_analysis_schemas import ObservationSummary
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import connection_url
from tests.observation_analysis_fixtures import read_page
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, create_package, create_tenant, sign_in
from tests.test_observation_analysis_exports import files
from tests.test_zone_form_succession import published_form, successor_body
from tests.zone_api_fixtures import ZoneSite, clean_zone_tenant, document

if TYPE_CHECKING:
    from sqlalchemy import Result

pytestmark = pytest.mark.integration


@dataclass(frozen=True)
class AuthorizationSite:
    bound: BoundSite
    training: bool
    observer_ids: tuple[UUID, UUID]
    manager_ids: tuple[UUID, UUID]

    @property
    def url(self) -> str:
        return f"{self.bound.site.project_url}/observations"

    def visible(self, role: str) -> set[UUID]:
        if role == "observer":
            return set(self.observer_ids)
        if role == "manager" and self.training:
            return set(self.manager_ids)
        if role in {"viewer", "manager", "admin", "owner"} and not self.training:
            return set(self.observer_ids + self.manager_ids)
        return set()


@pytest.fixture(params=[False, True], ids=["research", "training"])
def authorization_site(
    api_client: TestClient, signer: Signer, request: pytest.FixtureRequest
) -> Iterator[AuthorizationSite]:
    training = cast("bool", request.param)
    tenant = Tenant.new()
    create_tenant(tenant, is_training=training)
    try:
        package = create_package(api_client, signer, tenant)
        site = ZoneSite(tenant, package)
        inventory = published_form(api_client, site, "synthetic-inventory")
        body = successor_body(api_client, site, {"package_id": str(package)}, "shell-v1")
        body["inventory_form_version"] = inventory
        published = api_client.post(f"{site.project_url}/packages", json=body)
        assert published.status_code == 201, published.text
        package = Publication.model_validate_json(published.content).package.package_id
        history = api_client.get(f"{site.url}/zones", params={"package_id": str(package)})
        assert history.status_code == 200, history.text
        zone = HistoricalZones.model_validate_json(history.content).zones[0].zone_id
        bound = BoundSite(ZoneSite(tenant, package), package, zone)
        manager_ids, observer_ids = (uuid4(), uuid4()), (uuid4(), uuid4())
        for role, identifiers in (("manager", manager_ids), ("observer", observer_ids)):
            sign_in(api_client, signer, tenant.users[role])
            # Identical initials and timestamps deliberately cannot identify an owner.
            point = api_client.put(bound.url(identifiers[0]), json=bound.point())
            assert point.status_code == 200, point.text
            payload = bound.point(
                form_version=inventory,
                round_type="inventory",
                placement="zone",
                answers={"notes": "Synthetic inventory"},
            )
            del payload["coordinates"], payload["first_round"]
            uploaded = api_client.put(bound.url(identifiers[1]), json=payload)
            assert uploaded.status_code == 200, uploaded.text
        yield AuthorizationSite(bound, training, observer_ids, manager_ids)
    finally:
        clean_zone_tenant(tenant)


@pytest.mark.parametrize("role", ["observer", "viewer", "manager", "admin", "owner"])
def test_signed_reads_counts_filters_and_pages_use_creator_scope(
    api_client: TestClient, signer: Signer, authorization_site: AuthorizationSite, role: str
) -> None:
    site = authorization_site
    sign_in(api_client, signer, site.bound.site.tenant.users[role])
    expected = site.visible(role)
    filters = {
        "site_id": str(site.bound.site.tenant.site),
        "package_id": str(site.bound.package),
        "zone_id": str(site.bound.zone),
        "observer": "QA",
        "observed_from": "2026-10-10T00:00:00Z",
        "observed_before": "2026-10-11T00:00:00Z",
    }
    seen: list[UUID] = []
    cursor: dict[str, str] = {}
    while True:
        page = read_page(api_client, site.url, **filters, **cursor, limit=1)
        assert page.total_matching == len(expected)
        seen.extend(row.observation_id for row in page.items)
        if page.next_cursor is None:
            break
        cursor = {"cursor": page.next_cursor}
        assert len(seen) <= len(expected)
    assert len(seen) == len(set(seen))
    assert set(seen) == expected
    summary = api_client.get(site.url + "/summary", params=filters)
    assert summary.status_code == 200, summary.text
    totals = ObservationSummary.model_validate_json(summary.content)
    assert totals.total_matching == sum(group.count for group in totals.groups) == len(expected)
    for identifier in site.observer_ids + site.manager_ids:
        detail = api_client.get(f"{site.url}/{identifier}")
        assert detail.status_code == (200 if identifier in expected else 404), detail.text
        if identifier in expected:
            assert document(detail.content)["package_id"] == str(site.bound.package)
    points = read_page(api_client, site.url, **filters, bbox="-77,42,-76,43")
    inventories = read_page(api_client, site.url, **filters, round_type="inventory")
    assert points.total_matching == inventories.total_matching == len(expected) // 2


@pytest.mark.parametrize("role", ["observer", "viewer", "manager", "admin", "owner"])
@pytest.mark.parametrize("format_name", ["csv", "geojson"])
def test_exports_require_research_review_authority(
    api_client: TestClient,
    signer: Signer,
    authorization_site: AuthorizationSite,
    role: str,
    format_name: str,
) -> None:
    site = authorization_site
    sign_in(api_client, signer, site.bound.site.tenant.users[role])
    response = api_client.get(site.url + "/export", params={"format": format_name})
    if role == "observer" or site.training:
        assert response.status_code == 403, response.text
        assert ErrorEnvelope.model_validate_json(response.content).error.code == "role_required"
        assert "application/zip" not in response.headers["content-type"]
    else:
        assert response.status_code == 200, response.text
        assets = files(response.content)
        assert document(assets["metadata.json"])["total_matching"] == 4
        # Both immutable creators' points and inventories survive a complete export.
        for identifier in site.observer_ids + site.manager_ids:
            assert str(identifier).encode() in assets[f"observations.{format_name}"]


def restricted_rows(site: AuthorizationSite, user: UUID | None) -> dict[str, set[UUID]]:
    async def read() -> dict[str, set[UUID]]:
        engine = create_async_engine(connection_url())
        try:
            async with user_transaction(async_sessionmaker(engine), user or UUID(int=0)) as session:
                role: Result[tuple[str]] = await session.execute(text("SELECT current_user"))
                assert role.scalar_one() == "fieldmaps_api"
                statements = {
                    "raw": "SELECT id FROM fieldmaps.observations WHERE project_id=:project",
                    "recorded": "SELECT observation_id FROM gis.recorded_observations "
                    "WHERE project_id=:project",
                    "points": "SELECT observation_id FROM gis.point_events "
                    "WHERE project_id=:project",
                    "inventories": "SELECT observation_id FROM gis.inventory_records "
                    "WHERE project_id=:project",
                    "snapshots": "SELECT zone_id FROM gis.zone_snapshots WHERE project_id=:project",
                }
                rows: dict[str, set[UUID]] = {}
                for name, statement in statements.items():
                    result: Result[tuple[UUID]] = await session.execute(
                        text(statement), {"project": site.bound.site.tenant.project}
                    )
                    rows[name] = set(result.scalars())
                return rows
        finally:
            await engine.dispose()

    return anyio.run(read)


@pytest.mark.parametrize("role", ["observer", "viewer", "manager", "admin", "owner", "member"])
def test_runtime_sql_and_gis_views_enforce_creator_and_tenant_scope(
    authorization_site: AuthorizationSite, role: str
) -> None:
    site = authorization_site
    rows = restricted_rows(site, site.bound.site.tenant.users[role])
    expected = site.visible(role)
    assert rows["raw"] == rows["recorded"] == expected
    assert rows["points"] == expected.intersection({site.observer_ids[0], site.manager_ids[0]})
    assert rows["inventories"] == expected.intersection({site.observer_ids[1], site.manager_ids[1]})
    # Research snapshot metadata is available to package readers; Training activity is private.
    snapshots = bool(expected) if site.training else role != "member"
    assert rows["snapshots"] == ({site.bound.zone} if snapshots else set())


def test_membership_alone_and_foreign_authority_do_not_grant_access(
    api_client: TestClient, signer: Signer, authorization_site: AuthorizationSite
) -> None:
    site = authorization_site
    foreign = Tenant.new()
    create_tenant(foreign)
    try:
        for user in (site.bound.site.tenant.users["member"], foreign.users["owner"]):
            sign_in(api_client, signer, user)
            for suffix in ("", "/summary", "/export", f"/{site.observer_ids[0]}"):
                response = api_client.get(site.url + suffix)
                assert response.status_code == 404, response.text
            assert all(not identifiers for identifiers in restricted_rows(site, user).values())
        assert all(not identifiers for identifiers in restricted_rows(site, None).values())
    finally:
        clean_zone_tenant(foreign)


def test_observer_receipts_and_revocation_survive_read_restrictions(
    api_client: TestClient, signer: Signer, authorization_site: AuthorizationSite
) -> None:
    site = authorization_site
    tenant = site.bound.site.tenant
    sign_in(api_client, signer, tenant.users["observer"])
    own_url = site.bound.url(site.observer_ids[0])
    replay = api_client.put(own_url, json=site.bound.point())
    assert replay.status_code == 200, replay.text
    assert api_client.put(own_url, json=site.bound.point()).content == replay.content
    conflict = api_client.put(own_url, json=site.bound.point(answers={"people": 4}))
    assert conflict.status_code == 409, conflict.text
    other = api_client.put(site.bound.url(site.manager_ids[0]), json=site.bound.point())
    assert other.status_code == 409, other.text
    sign_in(api_client, signer, tenant.users["manager"])
    removed = api_client.delete(f"{site.bound.site.project_url}/members/{tenant.users['observer']}")
    assert removed.status_code == 204, removed.text
    sign_in(api_client, signer, tenant.users["observer"])
    revoked = api_client.put(own_url, json=site.bound.point())
    assert revoked.status_code in {403, 404}, revoked.text
    assert api_client.get(own_url).status_code == 404
    assert all(
        not identifiers for identifiers in restricted_rows(site, tenant.users["observer"]).values()
    )


def test_role_demotion_rechecks_export_and_cursor_authority(
    api_client: TestClient, signer: Signer, authorization_site: AuthorizationSite
) -> None:
    site = authorization_site
    tenant = site.bound.site.tenant
    sign_in(api_client, signer, tenant.users["manager"])
    first = read_page(api_client, site.url, limit=1)
    assert first.next_cursor is not None
    # Leave another manager so this changes authority without violating the last-manager rule.
    sign_in(api_client, signer, tenant.users["admin"])
    for user, role in ((tenant.users["viewer"], "manager"), (tenant.users["manager"], "observer")):
        changed = api_client.patch(
            f"{site.bound.site.project_url}/members/{user}", json={"role": role}
        )
        assert changed.status_code == 204, changed.text
    # The same signed user and pre-demotion cursor must use the current database authority.
    sign_in(api_client, signer, tenant.users["manager"])
    page = read_page(api_client, site.url, cursor=first.next_cursor)
    assert page.total_matching == 2
    assert {row.observation_id for row in page.items} <= set(site.manager_ids)
    assert restricted_rows(site, tenant.users["manager"])["raw"] == set(site.manager_ids)
    export = api_client.get(site.url + "/export")
    assert export.status_code == 403, export.text
