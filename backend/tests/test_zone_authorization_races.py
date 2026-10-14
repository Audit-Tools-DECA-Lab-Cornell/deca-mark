import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from threading import Event
from typing import Literal
from uuid import UUID, uuid4

import anyio
import httpx2
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.sql.elements import TextClause

from fieldmaps_api.config import Settings
from fieldmaps_api.deps import user_transaction
from fieldmaps_api.domain.zone_archive_jobs import ImportJob, PublishJob
from fieldmaps_api.domain.zone_package_schemas import PreparedZonePackage
from fieldmaps_api.queries import zones as zone_queries
from fieldmaps_api.repositories import identity as identity_db
from fieldmaps_api.repositories import tenancy as tenancy_db
from fieldmaps_api.repositories import zones as zone_db
from fieldmaps_api.routers import identity as identity_router
from fieldmaps_api.services import zone_archives
from tests.local_database import admin_sql, connection_url
from tests.package_fixtures import submission
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_zone_api_live",)
type Change = Literal["demote", "revoke", "inherited_admin", "forget"]


@dataclass
class Pause:
    reached: Event
    proceed: Event

    @classmethod
    def new(cls) -> "Pause":
        return cls(Event(), Event())

    async def wait(self) -> None:
        self.reached.set()
        assert await anyio.to_thread.run_sync(lambda: self.proceed.wait(10))


@dataclass(frozen=True)
class Race:
    api: LiveApi
    change: Change
    publish_url: str
    etag: str
    body: dict[str, str]

    @property
    def actor(self) -> str:
        return "admin" if self.change == "inherited_admin" else "manager"

    @property
    def sql_operation(self) -> str:
        return {
            "demote": "set_project_role",
            "revoke": "remove_project_member",
            "inherited_admin": "set_org_role",
            "forget": "forget_user",
        }[self.change]

    @property
    def rejected_status(self) -> int:
        return 404 if self.change in {"revoke", "inherited_admin"} else 403

    def publish(self) -> httpx2.Response:
        with self.api.client(self.actor) as client:
            return client.post(self.publish_url, headers={"If-Match": self.etag}, json=self.body)

    def mutate(self) -> httpx2.Response:
        tenant = self.api.tenant
        with self.api.client("manager" if self.change == "forget" else "owner") as client:
            if self.change == "forget":
                return client.delete("/v1/me")
            if self.change == "inherited_admin":
                return client.patch(
                    f"/v1/orgs/{tenant.org}/members/{tenant.users['admin']}",
                    json={"role": "member"},
                )
            path = f"/v1/projects/{tenant.project}/members/{tenant.users['manager']}"
            return (
                client.delete(path)
                if self.change == "revoke"
                else client.patch(path, json={"role": "viewer"})
            )

    def snapshot(self) -> str:
        return admin_sql(
            "SELECT jsonb_build_object("
            "'packages',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM "
            "fieldmaps.site_packages p WHERE project_id=:'project'),"
            "'drafts',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.id) FROM "
            "fieldmaps.zone_drafts d WHERE project_id=:'project'),"
            "'current',(SELECT jsonb_agg(to_jsonb(s)) FROM fieldmaps.site_zone_state s "
            "WHERE project_id=:'project'),"
            "'zones',(SELECT jsonb_agg(to_jsonb(z) ORDER BY z.package_id,z.zone_id) "
            "FROM fieldmaps.package_zones z WHERE project_id=:'project'),"
            "'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.request_id) "
            "FROM fieldmaps.zone_publications a WHERE project_id=:'project'),"
            "'observations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) "
            "FROM fieldmaps.observations o WHERE project_id=:'project'));",
            *self.api.tenant.variables(),
        )


def setup_race(api: LiveApi, change: Change, monkeypatch: pytest.MonkeyPatch) -> Race:
    if change != "inherited_admin":
        admin_sql(
            "INSERT INTO fieldmaps.project_memberships(organization_id,project_id,user_id,role) "
            "VALUES(:'org',:'project',:'other','manager');",
            *api.tenant.variables(),
            f"other={api.tenant.users['owner']}",
        )
    if change == "forget":

        async def synthetic_key(_settings: Settings) -> str:
            return "sb_secret_synthetic-race"

        async def pending_deletion(_settings: Settings, _key: str, _user: UUID) -> bool:
            return False

        monkeypatch.setattr(identity_router, "admin_key", synthetic_key)
        monkeypatch.setattr(identity_router, "delete_auth_user", pending_deletion)
    project = f"/v1/projects/{api.tenant.project}"
    drafts = f"{project}/sites/{api.tenant.site}/zone-drafts"
    with api.client("admin" if change == "inherited_admin" else "manager") as client:
        package = client.post(
            f"{project}/packages", json=submission(site_id=str(api.tenant.site))
        )
        assert package.status_code == 201, package.text
        published = document(package.content)["package"]
        assert isinstance(published, dict)
        base = str(published["package_id"])
        created = client.post(drafts, json={"request_id": str(uuid4()), "base_package_id": base})
        assert created.status_code == 201, created.text
    return Race(
        api,
        change,
        f"{drafts}/{document(created.content)['draft_id']}/publish",
        created.headers["etag"],
        {"request_id": str(uuid4()), "expected_current_package_id": base},
    )


def wait_for_lock(operation: str) -> None:
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        observed = admin_sql(
            "SELECT EXISTS(SELECT FROM pg_stat_activity WHERE usename='fieldmaps_api' "
            "AND wait_event_type='Lock' AND query LIKE '%' || :'operation' || '%');",
            f"operation={operation}",
        )
        if observed == "t":
            return
        time.sleep(0.025)
    pytest.fail(f"No observed SQL lock barrier for {operation}")


def pause_mutation(monkeypatch: pytest.MonkeyPatch, pause: Pause, operation: str) -> None:
    execute = tenancy_db.execute
    forget = identity_db.forget_user

    async def paused_execute(
        session: AsyncSession, query: TextClause, params: tenancy_db.Parameters
    ) -> None:
        await execute(session, query, params)
        if operation in str(query):
            await pause.wait()

    async def paused_forget(session: AsyncSession) -> None:
        await forget(session)
        await pause.wait()

    monkeypatch.setattr(tenancy_db, "execute", paused_execute)
    monkeypatch.setattr(identity_router, "forget_user", paused_forget)


@pytest.mark.parametrize("change", ["demote", "revoke", "inherited_admin", "forget"])
def test_authorization_change_wins_before_finalization(
    live_api: LiveApi, monkeypatch: pytest.MonkeyPatch, change: Change
) -> None:
    race = setup_race(live_api, change, monkeypatch)
    before = race.snapshot()
    prepared, changed = Pause.new(), Pause.new()
    prepare = zone_archives.prepare

    async def paused_prepare(
        job: PublishJob | ImportJob, archive: tuple[bytes, str] | None = None
    ) -> PreparedZonePackage:
        result = await prepare(job, archive)
        await prepared.wait()
        return result

    monkeypatch.setattr(zone_archives, "prepare", paused_prepare)
    pause_mutation(monkeypatch, changed, race.sql_operation)
    with ThreadPoolExecutor(max_workers=2) as workers:
        publication = workers.submit(race.publish)
        assert prepared.reached.wait(10)
        mutation = workers.submit(race.mutate)
        try:
            assert changed.reached.wait(10)
            prepared.proceed.set()
            wait_for_lock("finalize_zone_package")
        finally:
            prepared.proceed.set()
            changed.proceed.set()
        changed_response = mutation.result(timeout=15)
        response = publication.result(timeout=15)
    assert changed_response.status_code == (202 if change == "forget" else 204), (
        changed_response.text
    )
    assert response.status_code == race.rejected_status, response.text
    assert race.snapshot() == before


@pytest.mark.parametrize("change", ["demote", "revoke", "inherited_admin", "forget"])
def test_publication_wins_and_authorization_change_waits_for_commit(
    live_api: LiveApi, monkeypatch: pytest.MonkeyPatch, change: Change
) -> None:
    race = setup_race(live_api, change, monkeypatch)
    finalized = Pause.new()
    finalize = zone_db.finalize

    async def paused_finalize(
        session: AsyncSession, params: zone_db.Parameters
    ) -> tuple[UUID, bool]:
        result = await finalize(session, params)
        await finalized.wait()
        return result

    monkeypatch.setattr(zone_db, "finalize", paused_finalize)
    with ThreadPoolExecutor(max_workers=2) as workers:
        publication = workers.submit(race.publish)
        assert finalized.reached.wait(10)
        mutation = workers.submit(race.mutate)
        try:
            wait_for_lock(race.sql_operation)
            assert not mutation.done()
        finally:
            finalized.proceed.set()
        response = publication.result(timeout=15)
        changed_response = mutation.result(timeout=15)
    assert response.status_code == 201, response.text
    assert changed_response.status_code == (202 if change == "forget" else 204), (
        changed_response.text
    )
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.zone_publications WHERE project_id=:'project';",
            *live_api.tenant.variables(),
        )
        == "2"
    )
    after = race.snapshot()
    replay = race.publish()
    assert replay.status_code == race.rejected_status, replay.text
    assert race.snapshot() == after


def test_demotion_waits_while_finalizer_is_blocked_on_the_site(
    live_api: LiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    race = setup_race(live_api, "demote", monkeypatch)
    prepared, held = Pause.new(), Pause.new()
    prepare = zone_archives.prepare

    async def paused_prepare(
        job: PublishJob | ImportJob, archive: tuple[bytes, str] | None = None
    ) -> PreparedZonePackage:
        result = await prepare(job, archive)
        await prepared.wait()
        return result

    async def hold_site() -> None:
        engine = create_async_engine(connection_url())
        try:
            async with user_transaction(
                async_sessionmaker(engine), live_api.tenant.users["owner"]
            ) as session:
                await session.execute(
                    text("SELECT id FROM fieldmaps.sites WHERE id=:site FOR UPDATE"),
                    {"site": live_api.tenant.site},
                )
                await held.wait()
        finally:
            await engine.dispose()

    monkeypatch.setattr(zone_archives, "prepare", paused_prepare)
    with ThreadPoolExecutor(max_workers=3) as workers:
        publication = workers.submit(race.publish)
        assert prepared.reached.wait(10)
        holder = workers.submit(anyio.run, hold_site)
        assert held.reached.wait(10)
        try:
            prepared.proceed.set()
            wait_for_lock("finalize_zone_package")
            mutation = workers.submit(race.mutate)
            wait_for_lock("set_project_role")
            assert not mutation.done()
        finally:
            prepared.proceed.set()
            held.proceed.set()
        holder.result(timeout=15)
        response = publication.result(timeout=15)
        changed_response = mutation.result(timeout=15)
    assert response.status_code == 201, response.text
    assert changed_response.status_code == 204, changed_response.text
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.zone_publications WHERE project_id=:'project';",
            *live_api.tenant.variables(),
        )
        == "2"
    )


def test_draft_creation_and_publication_acquire_locks_in_the_same_order(
    live_api: LiveApi, monkeypatch: pytest.MonkeyPatch
) -> None:
    race = setup_race(live_api, "demote", monkeypatch)
    prepared, creating = Pause.new(), Pause.new()
    prepare = zone_archives.prepare
    invoke = zone_db.invoke

    async def paused_prepare(
        job: PublishJob | ImportJob, archive: tuple[bytes, str] | None = None
    ) -> PreparedZonePackage:
        result = await prepare(job, archive)
        await prepared.wait()
        return result

    async def paused_create(
        session: AsyncSession, query: TextClause, params: zone_db.Parameters
    ) -> str:
        if query is zone_queries.CREATE:
            await creating.wait()
        return await invoke(session, query, params)

    def create() -> httpx2.Response:
        with live_api.client("owner") as client:
            return client.post(
                race.publish_url.rsplit("/", 2)[0],
                json={
                    "request_id": str(uuid4()),
                    "base_package_id": race.body["expected_current_package_id"],
                },
            )

    monkeypatch.setattr(zone_archives, "prepare", paused_prepare)
    monkeypatch.setattr(zone_db, "invoke", paused_create)
    with ThreadPoolExecutor(max_workers=2) as workers:
        publication = workers.submit(race.publish)
        assert prepared.reached.wait(10)
        creation = workers.submit(create)
        try:
            assert creating.reached.wait(10)
            prepared.proceed.set()
            wait_for_lock("finalize_zone_package")
        finally:
            prepared.proceed.set()
            creating.proceed.set()
        created_response = creation.result(timeout=15)
        published_response = publication.result(timeout=15)
    assert created_response.status_code == 201, created_response.text
    assert published_response.status_code == 201, published_response.text
