from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from threading import Event
from uuid import uuid4

import anyio
import httpx2
import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.elements import TextClause

from fieldmaps_api.repositories import tenancy as tenancy_db
from fieldmaps_api.repositories import upload_receipts
from fieldmaps_api.repositories.upload_receipts import ReceiptIdentity, StoredReceipt
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql
from tests.test_zone_api_live import LiveApi
from tests.test_zone_authorization_races import wait_for_lock

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.bound_upload_live_fixtures",)


@dataclass(frozen=True, slots=True)
class TransactionPause:
    reached: Event
    proceed: Event

    @classmethod
    def new(cls) -> "TransactionPause":
        return cls(Event(), Event())

    async def wait(self) -> None:
        self.reached.set()
        assert await anyio.to_thread.run_sync(lambda: self.proceed.wait(10))


def revoke(api: LiveApi) -> httpx2.Response:
    with api.client("manager") as manager:
        return manager.delete(
            f"/v1/projects/{api.tenant.project}/members/{api.tenant.users['observer']}"
        )


def send(api: LiveApi, site: BoundSite, url: str) -> httpx2.Response:
    with api.client("observer") as collector:
        return collector.put(url, json=site.point())


def test_upload_commit_wins_before_membership_revocation(
    live_api: LiveApi, live_bound_site: BoundSite, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Given: a bound insert is paused after storage but before its transaction commits.
    pause = TransactionPause.new()
    committed = upload_receipts.committed

    async def paused_receipt(session: AsyncSession, identity: ReceiptIdentity) -> StoredReceipt:
        receipt = await committed(session, identity)
        await pause.wait()
        return receipt

    monkeypatch.setattr(upload_receipts, "committed", paused_receipt)
    url = live_bound_site.url(uuid4())
    # When: a manager tries to revoke membership while that upload holds authorization locks.
    with ThreadPoolExecutor(max_workers=2) as workers:
        upload = workers.submit(send, live_api, live_bound_site, url)
        assert pause.reached.wait(10)
        removal = workers.submit(revoke, live_api)
        try:
            wait_for_lock("remove_project_member")
        finally:
            pause.proceed.set()
        response = upload.result(timeout=15)
        removed = removal.result(timeout=15)
    # Then: the accepted upload commits first and subsequent retries lose access.
    assert response.status_code == 200, response.text
    assert removed.status_code == 204, removed.text
    retry = send(live_api, live_bound_site, url)
    assert retry.status_code == 403, retry.text


def test_membership_revocation_wins_before_upload_authorization(
    live_api: LiveApi, live_bound_site: BoundSite, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Given: revocation is paused after its database change but before commit.
    pause = TransactionPause.new()
    execute = tenancy_db.execute

    async def paused_execute(
        session: AsyncSession, query: TextClause, params: tenancy_db.Parameters
    ) -> None:
        await execute(session, query, params)
        if "remove_project_member" in str(query):
            await pause.wait()

    monkeypatch.setattr(tenancy_db, "execute", paused_execute)
    observation = uuid4()
    # When: the collector's request waits for that organization authorization lock.
    with ThreadPoolExecutor(max_workers=2) as workers:
        removal = workers.submit(revoke, live_api)
        assert pause.reached.wait(10)
        upload = workers.submit(send, live_api, live_bound_site, live_bound_site.url(observation))
        try:
            wait_for_lock("assert_zone_observer")
        finally:
            pause.proceed.set()
        removed = removal.result(timeout=15)
        response = upload.result(timeout=15)
    # Then: fresh authorization rejects the upload without storing it.
    assert removed.status_code == 204, removed.text
    assert response.status_code == 403, response.text
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.observations WHERE id=:'id';", f"id={observation}"
        )
        == "0"
    )
