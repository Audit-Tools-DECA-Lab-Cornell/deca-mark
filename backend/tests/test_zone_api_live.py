import socket
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from threading import Barrier, Event, Thread
from typing import override
from uuid import uuid4

import httpx2
import pytest
import uvicorn
from pydantic import TypeAdapter

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.config import Settings
from fieldmaps_api.main import create_app
from tests.local_database import database_url
from tests.signing import ISSUER, Signer
from tests.tenant_fixtures import Tenant, create_tenant, observation_payload
from tests.test_site_packages import submission
from tests.zone_api_fixtures import clean_zone_tenant, document

pytestmark = pytest.mark.integration


class ReadyServer(uvicorn.Server):
    ready: Event

    def __init__(self, config: uvicorn.Config) -> None:
        super().__init__(config)
        self.ready = Event()

    @override
    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets)
        self.ready.set()


@dataclass(frozen=True, slots=True)
class LiveApi:
    url: str
    tenant: Tenant
    signer: Signer

    def client(self, role: str = "manager") -> httpx2.Client:
        return httpx2.Client(
            base_url=self.url,
            headers={"Authorization": f"Bearer {self.signer.issue(self.tenant.users[role])}"},
            http2=True,
            limits=httpx2.Limits(
                max_connections=200, max_keepalive_connections=40, keepalive_expiry=30
            ),
            timeout=httpx2.Timeout(connect=5, read=30, write=10, pool=10),
            transport=httpx2.HTTPTransport(
                retries=3, socket_options=[(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)]
            ),
            follow_redirects=True,
        )


@pytest.fixture
def live_api(signer: Signer) -> Iterator[LiveApi]:
    tenant = Tenant.new()
    create_tenant(tenant)
    settings = Settings(database_url=database_url(), zone_publication_enabled=True)
    app = create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))
    server = ReadyServer(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="error"))
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        address = TypeAdapter(tuple[str, int]).validate_python(listener.getsockname())
        runner = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        runner.start()
        try:
            assert server.ready.wait(timeout=10), "Loopback Uvicorn failed to start"
            yield LiveApi(f"http://127.0.0.1:{address[1]}", tenant, signer)
        finally:
            server.should_exit = True
            runner.join(timeout=10)
            assert not runner.is_alive(), "Loopback Uvicorn failed to stop"
            clean_zone_tenant(tenant)


def test_loopback_http_edit_publish_history_and_legacy_upload(live_api: LiveApi) -> None:
    project = f"/v1/projects/{live_api.tenant.project}"
    site = f"{project}/sites/{live_api.tenant.site}"
    with live_api.client() as client:
        legacy = client.post(f"{project}/packages", json=submission())
        assert legacy.status_code == 201, legacy.text
        base = document(legacy.content)["package_id"]
        created = client.post(
            f"{site}/zone-drafts", json={"request_id": str(uuid4()), "base_package_id": base}
        )
        assert created.status_code == 201, created.text
        draft = document(created.content)
        url = f"{site}/zone-drafts/{draft['draft_id']}"
        edited = client.put(
            url,
            headers={"If-Match": created.headers["etag"]},
            json={"zones": draft["zones"], "change_note": "Live HTTP mapping confirmed"},
        )
        assert edited.status_code == 200, edited.text
        checked = client.post(f"{url}/validate", headers={"If-Match": edited.headers["etag"]})
        assert checked.status_code == 200, checked.text
        published = client.post(
            f"{url}/publish",
            headers={"If-Match": edited.headers["etag"]},
            json={"request_id": str(uuid4()), "expected_current_package_id": base},
        )
        assert published.status_code == 201, published.text
        package_summary = document(published.content)["package"]
        assert isinstance(package_summary, dict)
        package = package_summary["package_id"]
        historical = client.get(f"{site}/zones", params={"package_id": str(package)})
        assert historical.status_code == 200, historical.text
        assert "geometry_sha256" in historical.text
    with live_api.client("observer") as collector:
        uploaded = collector.put(f"{project}/observations/{uuid4()}", json=observation_payload())
        assert uploaded.status_code == 200, uploaded.text
        read = collector.get(f"{project}/observations")
        assert read.status_code == 200, read.text
        assert '"people":3' in read.text


def test_two_signed_manager_requests_cannot_activate_same_base_twice(live_api: LiveApi) -> None:
    project = f"/v1/projects/{live_api.tenant.project}"
    drafts = f"{project}/sites/{live_api.tenant.site}/zone-drafts"
    with live_api.client() as client:
        legacy = client.post(f"{project}/packages", json=submission())
        assert legacy.status_code == 201, legacy.text
        base = document(legacy.content)["package_id"]
        first = client.post(drafts, json={"request_id": str(uuid4()), "base_package_id": base})
        second = client.post(drafts, json={"request_id": str(uuid4()), "base_package_id": base})
        assert first.status_code == 201, first.text
        assert second.status_code == 201, second.text
    barrier = Barrier(2)

    def publish(response: httpx2.Response, role: str) -> httpx2.Response:
        with live_api.client(role) as manager:
            barrier.wait(timeout=10)
            return manager.post(
                f"{drafts}/{document(response.content)['draft_id']}/publish",
                headers={"If-Match": response.headers["etag"]},
                json={"request_id": str(uuid4()), "expected_current_package_id": base},
            )

    with ThreadPoolExecutor(max_workers=2) as workers:
        jobs = [workers.submit(publish, first, "manager"), workers.submit(publish, second, "admin")]
        results = [job.result(timeout=30) for job in jobs]
    assert sorted(result.status_code for result in results) == [201, 409], [
        result.text for result in results
    ]
    assert "publication_conflict" in next(
        result.text for result in results if result.status_code == 409
    )


def test_two_signed_manager_saves_have_exactly_one_revision_increment(live_api: LiveApi) -> None:
    project = f"/v1/projects/{live_api.tenant.project}"
    drafts = f"{project}/sites/{live_api.tenant.site}/zone-drafts"
    with live_api.client() as client:
        legacy = client.post(f"{project}/packages", json=submission())
        assert legacy.status_code == 201, legacy.text
        created = client.post(
            drafts,
            json={
                "request_id": str(uuid4()),
                "base_package_id": document(legacy.content)["package_id"],
            },
        )
        assert created.status_code == 201, created.text
        draft = document(created.content)
    url = f"{drafts}/{draft['draft_id']}"
    barrier = Barrier(2)

    def save(role: str) -> httpx2.Response:
        with live_api.client(role) as manager:
            barrier.wait(timeout=10)
            return manager.put(
                url,
                headers={"If-Match": created.headers["etag"]},
                json={"zones": draft["zones"], "change_note": role},
            )

    with ThreadPoolExecutor(max_workers=2) as workers:
        jobs = [workers.submit(save, "manager"), workers.submit(save, "admin")]
        results = [job.result(timeout=30) for job in jobs]
    assert sorted(result.status_code for result in results) == [200, 412], [
        result.text for result in results
    ]
    with live_api.client() as client:
        assert document(client.get(url).content)["revision"] == 2


def test_concurrent_draft_creation_returns_one_created_and_one_replay(live_api: LiveApi) -> None:
    project = f"/v1/projects/{live_api.tenant.project}"
    drafts = f"{project}/sites/{live_api.tenant.site}/zone-drafts"
    with live_api.client() as client:
        legacy = client.post(f"{project}/packages", json=submission())
        assert legacy.status_code == 201, legacy.text
        body = {
            "request_id": str(uuid4()),
            "base_package_id": document(legacy.content)["package_id"],
        }
    barrier = Barrier(2)

    def create() -> httpx2.Response:
        with live_api.client() as manager:
            barrier.wait(timeout=10)
            return manager.post(drafts, json=body)

    with ThreadPoolExecutor(max_workers=2) as workers:
        jobs = [workers.submit(create) for _ in range(2)]
        results = [job.result(timeout=30) for job in jobs]
    assert sorted(result.status_code for result in results) == [200, 201], [
        result.text for result in results
    ]
    assert results[0].content == results[1].content
    assert results[0].headers["etag"] == results[1].headers["etag"]
