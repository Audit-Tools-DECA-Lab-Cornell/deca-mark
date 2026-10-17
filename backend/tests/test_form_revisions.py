"""Revision checks through HTTP and real, independent database transactions."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from threading import Event
from uuid import UUID

import anyio
import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.repositories import forms
from tests.local_database import admin_sql, connection_url
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in
from tests.test_workspace_api import start_inventory

pytestmark = pytest.mark.integration


@pytest.fixture
def tenant(api_client: TestClient, signer: Signer) -> Iterator[Tenant]:
    value = Tenant.new()
    create_tenant(value)
    sign_in(api_client, signer, value.users["manager"])
    try:
        yield value
    finally:
        cleanup_tenant(value)


def test_two_editors_and_reviewed_publication(api_client: TestClient, tenant: Tenant) -> None:
    base = f"/v1/projects/{tenant.project}"
    draft = start_inventory(api_client, base)
    url = f"{base}/form-versions/{draft.code}"
    a, b = api_client.get(url), api_client.get(url)
    assert a.headers["etag"] == b.headers["etag"] == draft.etag
    first = api_client.put(
        url,
        headers={"If-Match": draft.etag},
        json={
            "definition": {**draft.definition, "title": "A's title"},
        },
    )
    assert first.status_code == 200, first.text
    saved = FormVersionDetail.model_validate_json(first.content)
    assert saved.revision == draft.revision + 1
    assert first.headers["etag"] == saved.etag != draft.etag
    stale = {"If-Match": draft.etag}
    refused = api_client.put(url, headers=stale, json={"definition": draft.definition})
    assert refused.status_code == 412, refused.text
    assert api_client.delete(url, headers=stale).status_code == 412
    assert api_client.post(url + "/publish", headers=stale).status_code == 412
    current = FormVersionDetail.model_validate_json(api_client.get(url).content)
    assert current == saved
    assert current.state == "draft"
    published = api_client.post(url + "/publish", headers={"If-Match": current.etag})
    assert published.status_code == 200, published.text
    frozen = FormVersionDetail.model_validate_json(published.content)
    assert frozen.title == "A's title"
    assert frozen.revision == saved.revision
    assert frozen.state == frozen.definition["status"] == "published"
    assert (
        api_client.put(
            url,
            headers={"If-Match": frozen.etag},
            json={
                "definition": draft.definition,
            },
        ).status_code
        == 409
    )
    assert api_client.delete(url, headers={"If-Match": frozen.etag}).status_code == 409


@pytest.mark.parametrize("method", ["PUT", "DELETE", "POST"])
@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "*",
        'W/"form-draft:x:1"',
        '"bad"',
        '"form-draft:00000000-0000-0000-0000-000000000000:0"',
        '"form-draft:00000000-0000-0000-0000-000000000000:-1"',
        '"form-draft:00000000-0000-0000-0000-000000000000:1", "other"',
        '"zone-draft:00000000-0000-0000-0000-000000000000:1"',
    ],
)
def test_missing_and_malformed_preconditions(
    api_client: TestClient,
    tenant: Tenant,
    method: str,
    value: str | None,
) -> None:
    draft = start_inventory(api_client, f"/v1/projects/{tenant.project}")
    url = f"/v1/projects/{tenant.project}/form-versions/{draft.code}"
    response = api_client.request(
        method,
        url + ("/publish" if method == "POST" else ""),
        headers={} if value is None else {"If-Match": value},
        json={"definition": draft.definition} if method == "PUT" else None,
    )
    assert response.status_code == 428, response.text
    assert FormVersionDetail.model_validate_json(api_client.get(url).content) == draft


def test_precondition_cannot_match_recreated_draft(api_client: TestClient, tenant: Tenant) -> None:
    base = f"/v1/projects/{tenant.project}"
    draft = start_inventory(api_client, base)
    url = f"{base}/form-versions/{draft.code}"
    assert api_client.delete(url, headers={"If-Match": draft.etag}).status_code == 204
    recreated = api_client.post(
        f"{base}/forms/inventory/versions", json={"definition": draft.definition}
    )
    assert recreated.status_code == 201, recreated.text
    current = FormVersionDetail.model_validate_json(recreated.content)
    assert current.code == draft.code
    assert current.revision == draft.revision
    assert current.version_id != draft.version_id
    assert api_client.delete(url, headers={"If-Match": draft.etag}).status_code == 412
    assert api_client.post(url + "/publish", headers={"If-Match": draft.etag}).status_code == 412


@pytest.mark.parametrize("action", ["save", "discard", "publish"])
def test_edit_committed_after_service_read_rejects_stale_mutation(
    api_client: TestClient,
    tenant: Tenant,
    monkeypatch: pytest.MonkeyPatch,
    action: str,
) -> None:
    base = f"/v1/projects/{tenant.project}"
    draft = start_inventory(api_client, base)
    url = f"{base}/form-versions/{draft.code}"
    original_save, original_discard, original_publish = (
        forms.update_draft,
        forms.discard_draft,
        forms.publish,
    )

    async def compete() -> None:
        engine = create_async_engine(connection_url(), poolclass=NullPool)
        try:
            async with engine.begin() as transaction:
                await transaction.execute(
                    text("SELECT set_config('fieldmaps.user_id', :manager, true)"),
                    {"manager": str(tenant.users["manager"])},
                )
                await transaction.execute(
                    text(
                        "UPDATE fieldmaps.form_versions SET definition = "
                        "jsonb_set(definition, '{title}', '\"Unreviewed edit\"') WHERE id=:id"
                    ),
                    {"id": draft.version_id},
                )
        finally:
            await engine.dispose()

    async def save(  # noqa: PLR0913, PLR0917 - repository signature
        session: AsyncSession,
        project_id: UUID,
        code: str,
        definition: dict[str, JsonValue],
        version_id: UUID,
        revision: int,
    ) -> bool:
        await compete()
        return await original_save(session, project_id, code, definition, version_id, revision)

    async def discard(
        session: AsyncSession, project_id: UUID, code: str, version_id: UUID, revision: int
    ) -> bool:
        await compete()
        return await original_discard(session, project_id, code, version_id, revision)

    async def publish(
        session: AsyncSession, project_id: UUID, version_id: UUID, revision: int
    ) -> None:
        await compete()
        await original_publish(session, project_id, version_id, revision)

    monkeypatch.setattr(forms, "update_draft", save)
    monkeypatch.setattr(forms, "discard_draft", discard)
    monkeypatch.setattr(forms, "publish", publish)
    headers = {"If-Match": draft.etag}
    response = (
        api_client.put(url, headers=headers, json={"definition": draft.definition})
        if action == "save"
        else api_client.delete(url, headers=headers)
        if action == "discard"
        else api_client.post(url + "/publish", headers=headers)
    )
    assert response.status_code == 412, response.text
    current = FormVersionDetail.model_validate_json(api_client.get(url).content)
    assert (current.state, current.revision, current.title) == ("draft", 2, "Unreviewed edit")
    assert current.published_at is None


def test_publication_lock_freezes_reviewed_revision_before_waiting_edit(
    api_client: TestClient,
    tenant: Tenant,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    draft = start_inventory(api_client, f"/v1/projects/{tenant.project}")
    url = f"/v1/projects/{tenant.project}/form-versions/{draft.code}"
    locked, release = Event(), Event()
    original_publish = forms.publish

    async def publish(
        session: AsyncSession, project_id: UUID, version_id: UUID, revision: int
    ) -> None:
        await original_publish(session, project_id, version_id, revision)
        locked.set()
        assert await anyio.to_thread.run_sync(release.wait, 20), "publication was not released"

    monkeypatch.setattr(forms, "publish", publish)
    headers = {"If-Match": draft.etag}
    with ThreadPoolExecutor(max_workers=2) as pool:
        publication = pool.submit(api_client.post, url + "/publish", headers=headers)
        try:
            assert locked.wait(10), "publication did not lock the version"
            edit = pool.submit(
                api_client.put,
                url,
                headers=headers,
                json={
                    "definition": {**draft.definition, "title": "Unreviewed waiting edit"},
                },
            )

            # Observe a real database lock wait before releasing publication.
            async def wait_for_edit() -> None:
                with anyio.fail_after(10):
                    while (  # noqa: ASYNC110 - poll the database lock state, not a task event
                        admin_sql(
                            "SELECT count(*) FROM pg_stat_activity WHERE usename='fieldmaps_api' "
                            "AND wait_event_type='Lock' "
                            "AND query LIKE '%UPDATE fieldmaps.form_versions%'"
                        )
                        == "0"
                    ):
                        await anyio.sleep(0.02)

            anyio.run(wait_for_edit)
        finally:
            release.set()
        assert publication.result(timeout=15).status_code == 200
        assert edit.result(timeout=15).status_code == 409
    frozen = FormVersionDetail.model_validate_json(api_client.get(url).content)
    assert (frozen.state, frozen.title, frozen.revision) == (
        "published",
        draft.title,
        draft.revision,
    )


@pytest.mark.parametrize("method", ["PUT", "DELETE", "POST"])
def test_duplicate_preconditions_are_not_collapsed(
    api_client: TestClient,
    tenant: Tenant,
    method: str,
) -> None:
    draft = start_inventory(api_client, f"/v1/projects/{tenant.project}")
    url = f"/v1/projects/{tenant.project}/form-versions/{draft.code}"
    response = api_client.request(
        method,
        url + ("/publish" if method == "POST" else ""),
        headers=[("If-Match", draft.etag), ("If-Match", draft.etag)],
        json={"definition": draft.definition} if method == "PUT" else None,
    )
    assert response.status_code == 428, response.text
    assert FormVersionDetail.model_validate_json(api_client.get(url).content) == draft


@pytest.mark.parametrize("role", ["observer", "viewer"])
def test_preconditions_do_not_grant_authority(
    api_client: TestClient,
    tenant: Tenant,
    signer: Signer,
    role: str,
) -> None:
    draft = start_inventory(api_client, f"/v1/projects/{tenant.project}")
    url = f"/v1/projects/{tenant.project}/form-versions/{draft.code}"
    sign_in(api_client, signer, tenant.users[role])
    headers = {"If-Match": draft.etag}
    assert (
        api_client.put(url, headers=headers, json={"definition": draft.definition}).status_code
        == 403
    )
    assert api_client.delete(url, headers=headers).status_code == 403
    assert api_client.post(url + "/publish", headers=headers).status_code == 403
    sign_in(api_client, signer, tenant.users["manager"])
    assert FormVersionDetail.model_validate_json(api_client.get(url).content) == draft
