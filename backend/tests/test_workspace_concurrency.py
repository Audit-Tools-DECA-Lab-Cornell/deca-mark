"""Force competing manager operations between the initial read and the conditional write."""

from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import UUID

import anyio
import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from fieldmaps_api.config import Settings
from fieldmaps_api.database import database_connection
from fieldmaps_api.domain.zone_package_schemas import PreparedZonePackage
from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.repositories import forms
from fieldmaps_api.services import zone_publication
from fieldmaps_api.services.zone_publication import PublicationRequest
from fieldmaps_api.zone_response_schemas import Publication
from tests.local_database import admin_sql, database_url, password_file
from tests.package_fixtures import submission
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in
from tests.test_workspace_api import inventory, start_inventory

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


@pytest.mark.parametrize("action", ["save", "discard"])
@pytest.mark.parametrize("competitor", ["publish", "discard"])
def test_a_changed_draft_cannot_be_reported_as_saved_or_discarded(
    api_client: TestClient,
    tenant: Tenant,
    monkeypatch: pytest.MonkeyPatch,
    action: str,
    competitor: str,
) -> None:
    base = f"/v1/projects/{tenant.project}"
    version = start_inventory(api_client, base)
    original_save, original_discard = forms.update_draft, forms.discard_draft

    async def compete() -> None:
        # Commit on another connection after the service read but before its conditional write.
        statement = (
            "SELECT fieldmaps_private.publish_form_version(:project, :version, :revision)"
            if competitor == "publish"
            else "DELETE FROM fieldmaps.form_versions WHERE id=:version AND state='draft'"
        )
        connection = database_connection(
            Settings(
                database_url=database_url(),
                database_password_file=password_file(),
            )
        )
        engine = create_async_engine(connection.url, poolclass=NullPool)
        try:
            async with engine.begin() as transaction:
                await transaction.execute(
                    text("SELECT set_config('fieldmaps.user_id', :manager, true)"),
                    {"manager": str(tenant.users["manager"])},
                )
                await transaction.execute(
                    text(statement),
                    {
                        "project": tenant.project,
                        "version": version.version_id,
                        "revision": version.revision,
                    },
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

    monkeypatch.setattr(forms, "update_draft", save)
    monkeypatch.setattr(forms, "discard_draft", discard)
    url = f"{base}/form-versions/{version.code}"
    changed = {**inventory(), "title": "A competing edit"}
    response = (
        api_client.put(url, json={"definition": changed}, headers={"If-Match": version.etag})
        if action == "save"
        else api_client.delete(url, headers={"If-Match": version.etag})
    )
    assert response.status_code == (409 if competitor == "publish" else 404), response.text
    current = api_client.get(url)
    if competitor == "publish":
        stored = FormVersionDetail.model_validate_json(current.content)
        assert stored.state == "published"
        assert stored.title == version.title
    else:
        assert current.status_code == 404


@pytest.mark.parametrize("resource", ["packages", "drafts"])
def test_simultaneous_version_creation_returns_a_conflict_without_partial_rows(
    api_client: TestClient, tenant: Tenant, monkeypatch: pytest.MonkeyPatch, resource: str
) -> None:
    base = f"/v1/projects/{tenant.project}"
    barrier = Barrier(2, timeout=10)
    original_form = forms.next_version
    original_finalize = zone_publication.finalize

    async def package_finalize(
        session: AsyncSession,
        request: PublicationRequest,
        prepared: PreparedZonePackage | None,
    ) -> tuple[Publication, bool]:
        await anyio.to_thread.run_sync(barrier.wait)
        return await original_finalize(session, request, prepared)

    async def form_number(session: AsyncSession, form: UUID) -> int:
        version = await original_form(session, form)
        await anyio.to_thread.run_sync(barrier.wait)
        return version

    payloads: list[dict[str, object]]
    if resource == "packages":
        url = f"{base}/packages"
        payloads = [
            submission(site_id=str(tenant.site)),
            submission(site_id=str(tenant.site)),
        ]
    else:
        start_inventory(api_client, base)
        url = f"{base}/forms/inventory/versions"
        payloads = [{}, {}]
    with monkeypatch.context() as patch:
        if resource == "packages":
            patch.setattr(zone_publication, "finalize", package_finalize)
        else:
            patch.setattr(forms, "next_version", form_number)
        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(api_client.post, url, json=payload) for payload in payloads]
            responses = [future.result(timeout=20) for future in futures]
    assert sorted(response.status_code for response in responses) == [201, 409]
    if resource == "packages":
        assert (
            admin_sql(
                "SELECT count(*) FROM fieldmaps.site_packages WHERE project_id=:'project'; "
                "SELECT count(*) FROM fieldmaps.package_checks WHERE package_id IN "
                "(SELECT id FROM fieldmaps.site_packages WHERE project_id=:'project');",
                *tenant.variables(),
            )
            == "1\n5"
        )
    else:
        assert (
            admin_sql(
                "SELECT count(*) FROM fieldmaps.form_versions "
                "WHERE project_id=:'project' AND code='inventory-v2';",
                *tenant.variables(),
            )
            == "1"
        )
    winner = next(index for index, response in enumerate(responses) if response.status_code == 201)
    expected_retry_status = 200 if resource == "packages" else 201
    assert api_client.post(url, json=payloads[winner]).status_code == expected_retry_status
