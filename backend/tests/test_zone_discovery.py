from collections.abc import AsyncGenerator, Iterator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, NoReturn, cast
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.config import Settings
from fieldmaps_api.domain.zone_archive_jobs import Bootstrap
from fieldmaps_api.main import create_app
from fieldmaps_api.services import zone_archives, zone_discovery, zones
from fieldmaps_api.zone_response_schemas import SiteV2
from tests.local_database import database_url, password_file
from tests.signing import ISSUER, Signer
from tests.tenant_fixtures import sign_in
from tests.test_site_packages import submission
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import ZoneSite, publish_draft

if TYPE_CHECKING:
    from anyio.from_thread import BlockingPortal

pytest_plugins = ("tests.test_zone_api_live",)
pytestmark = pytest.mark.integration


def forbidden_archive(_archive: tuple[bytes, str]) -> NoReturn:
    pytest.fail("Managed or unauthorized discovery must not extract an archive")


def test_managed_discovery_uses_database_metadata_only(
    api_client: TestClient, zone_site: ZoneSite, monkeypatch: pytest.MonkeyPatch
) -> None:
    package = publish_draft(api_client, zone_site)

    async def forbidden_read(_session: AsyncSession, _project: UUID, _package: UUID) -> NoReturn:
        pytest.fail("Managed discovery must not read archive bytes")

    monkeypatch.setattr(zone_discovery, "read_package_archive", forbidden_read)
    monkeypatch.setattr(zone_archives, "extract", forbidden_archive)
    for _ in range(2):
        result = api_client.get(f"/v2/projects/{zone_site.tenant.project}/sites")
        assert result.status_code == 200, result.text
        selected = TypeAdapter(list[SiteV2]).validate_json(result.content)[0]
        assert str(selected.current_package_id) == package["package_id"]
        assert selected.zone_editing_available is True


def test_legacy_capability_is_cached_and_extraction_has_no_open_transaction(
    api_client: TestClient, zone_site: ZoneSite, monkeypatch: pytest.MonkeyPatch
) -> None:
    original_transaction = zones.transaction
    original_extract = zone_archives.extract
    active_transactions = 0
    calls = 0

    @asynccontextmanager
    async def tracked_transaction(
        sessions: async_sessionmaker[AsyncSession], user: UUID
    ) -> AsyncGenerator[AsyncSession]:
        nonlocal active_transactions
        async with original_transaction(sessions, user) as session:
            active_transactions += 1
            try:
                yield session
            finally:
                active_transactions -= 1

    async def tracked_extract(archive: tuple[bytes, str]) -> Bootstrap:
        nonlocal calls
        assert active_transactions == 0
        calls += 1
        return await original_extract(archive)

    monkeypatch.setattr(zones, "transaction", tracked_transaction)
    monkeypatch.setattr(zone_archives, "extract", tracked_extract)
    url = f"/v2/projects/{zone_site.tenant.project}/sites"
    for _ in range(2):
        result = api_client.get(url)
        assert result.status_code == 200, result.text
        assert result.json()[0]["zone_editing_available"] is True
    assert calls == 1
    retired = api_client.post(zone_site.project_url + "/form-versions/shell-v1/retire")
    assert retired.status_code == 200, retired.text
    result = api_client.get(url)
    assert result.status_code == 200, result.text
    assert result.json()[0]["zone_editing_available"] is False
    assert calls == 1


def test_cached_structure_does_not_cache_manager_access(
    api_client: TestClient,
    signer: Signer,
    zone_site: ZoneSite,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    url = f"/v2/projects/{zone_site.tenant.project}/sites"
    assert api_client.get(url).json()[0]["zone_editing_available"] is True
    monkeypatch.setattr(zone_archives, "extract", forbidden_archive)
    sign_in(api_client, signer, zone_site.tenant.users["observer"])
    result = api_client.get(url)
    assert result.status_code == 200, result.text
    assert result.json()[0]["zone_editing_available"] is False


def test_disabled_gate_performs_no_legacy_inspection(
    api_client: TestClient,
    signer: Signer,
    zone_site: ZoneSite,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(zone_archives, "extract", forbidden_archive)
    settings = Settings(database_url=database_url(), database_password_file=password_file())
    with TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client:
        client.headers["Authorization"] = api_client.headers["Authorization"]
        result = client.get(f"/v2/projects/{zone_site.tenant.project}/sites")
        assert result.status_code == 200, result.text
        assert result.json()[0]["zone_editing_available"] is False


def test_legacy_package_identity_changes_trigger_inspection_and_cache_is_bounded(
    signer: Signer, zone_site: ZoneSite, monkeypatch: pytest.MonkeyPatch
) -> None:
    caches: list[zone_discovery.LegacyCapabilities] = []
    original_cache = zone_discovery.LegacyCapabilities
    original_extract = zone_archives.extract
    calls = 0

    def bounded_cache() -> zone_discovery.LegacyCapabilities:
        cache = original_cache(capacity=2)
        caches.append(cache)
        return cache

    async def tracked_extract(archive: tuple[bytes, str]) -> Bootstrap:
        nonlocal calls
        calls += 1
        return await original_extract(archive)

    monkeypatch.setattr(zone_discovery, "LegacyCapabilities", bounded_cache)
    monkeypatch.setattr(zone_archives, "extract", tracked_extract)
    settings = Settings(
        database_url=database_url(),
        database_password_file=password_file(),
        zone_publication_enabled=True,
    )
    with TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client:
        sign_in(client, signer, zone_site.tenant.users["manager"])
        url = f"/v2/projects/{zone_site.tenant.project}/sites"
        assert client.get(url).json()[0]["zone_editing_available"] is True
        for _ in range(2):
            added = client.post(zone_site.project_url + "/packages", json=submission())
            assert added.status_code == 201, added.text
            result = client.get(url)
            assert result.status_code == 200, result.text
            assert result.json()[0]["zone_editing_available"] is True
        assert calls == 3
        assert len(caches) == 1
        assert len(caches[0].entries) == 2
        assert all(key[0] != zone_site.package_id for key in caches[0].entries)


def test_more_sites_than_cache_entries_preserve_all_inspected_capabilities(
    api_client: TestClient,
    signer: Signer,
    zone_site: ZoneSite,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_cache = zone_discovery.LegacyCapabilities

    def bounded_cache() -> zone_discovery.LegacyCapabilities:
        return original_cache(capacity=2)

    for index in range(2):
        code = f"discovery-site-{index}"
        site = api_client.post(zone_site.project_url + "/sites", json={"code": code, "name": code})
        assert site.status_code == 201, site.text
        package = api_client.post(
            zone_site.project_url + "/packages", json=submission(site_code=code)
        )
        assert package.status_code == 201, package.text
    monkeypatch.setattr(zone_discovery, "LegacyCapabilities", bounded_cache)
    settings = Settings(
        database_url=database_url(),
        database_password_file=password_file(),
        zone_publication_enabled=True,
    )
    with TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client:
        sign_in(client, signer, zone_site.tenant.users["manager"])
        result = client.get(f"/v2/projects/{zone_site.tenant.project}/sites")
        assert result.status_code == 200, result.text
        sites = TypeAdapter(list[SiteV2]).validate_json(result.content)
        assert len(sites) == 3
        assert all(site.zone_editing_available for site in sites)


@pytest.fixture
def occupied_publication_capacity(
    signer: Signer, monkeypatch: pytest.MonkeyPatch
) -> Iterator[TestClient]:
    workers: list[zones.ZoneWork] = []
    original_init = zones.ZoneWork.__init__

    def captured_init(work: zones.ZoneWork) -> None:
        original_init(work)
        workers.append(work)

    monkeypatch.setattr(zones.ZoneWork, "__init__", captured_init)
    settings = Settings(database_url=database_url(), database_password_file=password_file())
    with TestClient(create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))) as client:
        portal = cast("BlockingPortal", client.portal)
        assert portal is not None
        portal.call(workers[0].limiter.acquire_on_behalf_of_nowait, "publication-one")
        portal.call(workers[0].limiter.acquire_on_behalf_of_nowait, "publication-two")
        try:
            yield client
        finally:
            portal.call(workers[0].limiter.release_on_behalf_of, "publication-one")
            portal.call(workers[0].limiter.release_on_behalf_of, "publication-two")


def test_observer_discovery_remains_available_when_publication_slots_are_busy(
    occupied_publication_capacity: TestClient, signer: Signer, zone_site: ZoneSite
) -> None:
    sign_in(occupied_publication_capacity, signer, zone_site.tenant.users["observer"])
    result = occupied_publication_capacity.get(f"/v2/projects/{zone_site.tenant.project}/sites")
    assert result.status_code == 200, result.text
    assert result.json()[0]["zone_editing_available"] is False


def test_loopback_http_managed_discovery_never_extracts_archive(
    live_api: LiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    project_url = f"/v1/projects/{live_api.tenant.project}"
    drafts = f"{project_url}/sites/{live_api.tenant.site}/zone-drafts"
    with live_api.client() as client:
        legacy = client.post(project_url + "/packages", json=submission())
        assert legacy.status_code == 201, legacy.text
        created = client.post(
            drafts,
            json={"request_id": str(uuid4()), "base_package_id": legacy.json()["package_id"]},
        )
        assert created.status_code == 201, created.text
        published = client.post(
            drafts + f"/{created.json()['draft_id']}/publish",
            headers={"If-Match": created.headers["etag"]},
            json={
                "request_id": str(uuid4()),
                "expected_current_package_id": legacy.json()["package_id"],
            },
        )
        assert published.status_code == 201, published.text
        monkeypatch.setattr(zone_archives, "extract", forbidden_archive)
        result = client.get(f"/v2/projects/{live_api.tenant.project}/sites")
        assert result.status_code == 200, result.text
        assert result.json()[0]["zone_editing_available"] is True
