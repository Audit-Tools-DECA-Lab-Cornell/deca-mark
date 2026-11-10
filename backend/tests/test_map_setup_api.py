import base64
import json
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from typing import Literal
from uuid import uuid4

import anyio
import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.packages import ProjectFile
from fieldmaps_api.map_setup_schemas import MapSetup, MapSetupSummary
from fieldmaps_api.services import map_setup_imports
from fieldmaps_api.services.map_setup_imports import ImportData
from tests.local_database import admin_sql
from tests.map_setup_fixtures import qgz_request
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, create_tenant, sign_in
from tests.zone_api_fixtures import clean_zone_tenant

pytestmark = pytest.mark.integration


@pytest.fixture
def setup_site(api_client: TestClient, signer: Signer) -> Iterator[Tenant]:
    tenant = Tenant.new()
    create_tenant(tenant)
    sign_in(api_client, signer, tenant.users["manager"])
    try:
        yield tenant
    finally:
        admin_sql(
            "BEGIN; DELETE FROM fieldmaps_private.map_setup_operations WHERE setup_id IN "
            "(SELECT id FROM fieldmaps.map_setups WHERE project_id=:'project'); "
            "DELETE FROM fieldmaps_private.map_setup_sources WHERE setup_id IN "
            "(SELECT id FROM fieldmaps.map_setups WHERE project_id=:'project'); "
            "DELETE FROM fieldmaps.map_setups WHERE project_id=:'project'; COMMIT;",
            *tenant.variables(),
        )
        clean_zone_tenant(tenant)


def setup_url(tenant: Tenant) -> str:
    return f"/v1/projects/{tenant.project}/sites/{tenant.site}/map-setups"


def import_setup(client: TestClient, tenant: Tenant) -> tuple[str, str, MapSetup]:
    body = {
        **qgz_request("outline-no-zones").model_dump(mode="json"),
        "request_id": str(uuid4()),
        "expected_current_package_id": None,
    }
    response = client.post(f"{setup_url(tenant)}/import", json=body)
    assert response.status_code == 201, response.text
    setup = MapSetup.model_validate_json(response.content)
    return f"{setup_url(tenant)}/{setup.setup_id}", response.headers["etag"], setup


def test_first_import_is_saveable_before_boundaries_or_forms(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given a real first-map project containing ground but no zones.
    url, etag, setup = import_setup(api_client, setup_site)
    # When the manager retrieves the acknowledged setup.
    response = api_client.get(url)
    # Then sources persist while incomplete geometry remains unpublished.
    assert response.status_code == 200, response.text
    assert response.headers["etag"] == etag
    restored = MapSetup.model_validate_json(response.content)
    assert restored.content == setup.content
    assert restored.content.outline is None
    assert restored.content.zones == ()
    assert restored.content.form_version is None
    assert len(restored.layers) == 1
    assert "project_file" not in response.json()
    assert "content" not in response.json()["sources"][0]


def test_incomplete_setup_validation_never_publishes(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given a durably imported but unfinished setup.
    url, etag, _ = import_setup(api_client, setup_site)
    # When publication validation is requested.
    response = api_client.post(f"{url}/validate", headers={"If-Match": etag})
    # Then the blocker is explicit and the current map stays empty.
    assert response.status_code == 422, response.text
    site = api_client.get(f"/v1/projects/{setup_site.project}/sites/{setup_site.site}")
    assert site.json()["current_package_id"] is None


def test_stale_save_preserves_last_acknowledged_snapshot(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given one accepted save after the original revision.
    url, etag, setup = import_setup(api_client, setup_site)
    content = setup.content.model_copy(update={"change_note": "First manager save"}).model_dump(
        mode="json"
    )
    first = api_client.put(url, headers={"If-Match": etag}, json=content)
    assert first.status_code == 200, first.text
    # When a second manager saves against the stale revision.
    stale = api_client.put(
        url, headers={"If-Match": etag}, json={**content, "change_note": "stale overwrite"}
    )
    # Then accepted content is not overwritten.
    assert stale.status_code == 412, stale.text
    assert (
        MapSetup.model_validate_json(api_client.get(url).content).content.change_note
        == "First manager save"
    )


def test_observer_cannot_resume_manager_setup(
    api_client: TestClient, signer: Signer, setup_site: Tenant
) -> None:
    # Given a manager's private setup.
    url, _, _ = import_setup(api_client, setup_site)
    sign_in(api_client, signer, setup_site.users["observer"])
    # When an observer requests it.
    response = api_client.get(url)
    # Then no source or geometry is exposed.
    assert response.status_code == 403, response.text
    assert "layers" not in response.json()


def test_missing_source_can_be_added_after_reload_without_replacing_drawn_work(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given a saved setup whose project references a missing tree file.
    body = {
        **qgz_request("missing-source").model_dump(mode="json"),
        "request_id": str(uuid4()),
        "expected_current_package_id": None,
    }
    created = api_client.post(f"{setup_url(setup_site)}/import", json=body)
    assert created.status_code == 201, created.text
    setup = MapSetup.model_validate_json(created.content)
    url = f"{setup_url(setup_site)}/{setup.setup_id}"
    manual_outline = {
        "type": "Polygon",
        "coordinates": [
            [
                [-76.491, 42.439],
                [-76.479, 42.439],
                [-76.479, 42.451],
                [-76.491, 42.439],
            ]
        ],
    }
    manual_zone = {
        "zone_id": str(uuid4()),
        "zone_code": "DRAWN",
        "zone_label": "Drawn lawn",
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                [
                    [-76.488, 42.442],
                    [-76.482, 42.442],
                    [-76.482, 42.448],
                    [-76.488, 42.442],
                ]
            ],
        },
    }
    saved_content = setup.content.model_dump(mode="json")
    saved_content.update(
        {
            "outline": manual_outline,
            "zones": [manual_zone],
            "change_note": "Keep manual boundaries during source recovery",
        }
    )
    saved = api_client.put(url, headers={"If-Match": created.headers["etag"]}, json=saved_content)
    assert saved.status_code == 200, saved.text
    acknowledged = MapSetup.model_validate_json(saved.content)
    # Reload before adding the source, as a manager returning in a later browser session would.
    reloaded = api_client.get(url)
    assert reloaded.status_code == 200
    reloaded_setup = MapSetup.model_validate_json(reloaded.content)
    assert reloaded_setup.content == acknowledged.content
    tree = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {},
                "geometry": {"type": "Point", "coordinates": [-76.485, 42.445]},
            }
        ],
    }
    addition = {
        "request_id": str(uuid4()),
        "preview": True,
        "files": [
            {
                "file_name": "trees.geojson",
                "content": base64.b64encode(json.dumps(tree).encode()).decode(),
            }
        ],
    }
    # When the manager previews then confirms recovery against the acknowledged revision.
    candidate = api_client.post(
        f"{url}/sources", headers={"If-Match": reloaded.headers["etag"]}, json=addition
    )
    assert candidate.status_code == 200, candidate.text
    assert (
        MapSetup.model_validate_json(api_client.get(url).content).revision
        == reloaded_setup.revision
    )
    committed = api_client.post(
        f"{url}/sources",
        headers={"If-Match": reloaded.headers["etag"]},
        json={
            **addition,
            "request_id": str(uuid4()),
            "preview": False,
            "candidate_hash": candidate.json()["candidate_hash"],
        },
    )
    # Then the resolved layer is present and the import generation advances exactly once.
    assert committed.status_code == 200, committed.text
    restored = MapSetup.model_validate_json(committed.content)
    assert restored.import_generation == 2
    assert len(restored.layers) == 2
    assert not restored.issues
    assert restored.content.outline == acknowledged.content.outline
    assert restored.content.zones == acknowledged.content.zones
    assert restored.content.change_note == acknowledged.content.change_note


def test_save_without_revision_is_refused(api_client: TestClient, setup_site: Tenant) -> None:
    # Given a saved draft whose caller omitted the acknowledged revision.
    url, _, setup = import_setup(api_client, setup_site)
    # When it attempts a save, then the server requires a precondition.
    response = api_client.put(url, json=setup.content.model_dump(mode="json"))
    assert response.status_code == 428, response.text


def test_malformed_save_keeps_acknowledged_state(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given a valid acknowledged draft.
    url, etag, setup = import_setup(api_client, setup_site)
    # When an unsafe longitude is submitted, then it is refused without changing revision.
    content = setup.content.model_dump(mode="json")
    content["outline"] = {
        "type": "Polygon",
        "coordinates": [[[999, 42], [0, 42], [0, 43], [999, 42]]],
    }
    rejected = api_client.put(url, headers={"If-Match": etag}, json=content)
    assert rejected.status_code == 422, rejected.text
    assert api_client.get(url).headers["etag"] == etag


def test_import_receipt_replays_without_creating_another_draft(
    api_client: TestClient, setup_site: Tenant
) -> None:
    # Given an import request already accepted once.
    body = {
        **qgz_request("outline-no-zones").model_dump(mode="json"),
        "request_id": str(uuid4()),
        "expected_current_package_id": None,
    }
    first = api_client.post(f"{setup_url(setup_site)}/import", json=body)
    assert first.status_code == 201, first.text
    # When the exact request is retried, then the original setup is returned once.
    replay = api_client.post(f"{setup_url(setup_site)}/import", json=body)
    assert replay.status_code == 200, replay.text
    assert replay.json()["setup_id"] == first.json()["setup_id"]
    listed = api_client.get(setup_url(setup_site))
    summaries = TypeAdapter(list[MapSetupSummary]).validate_json(listed.content)
    raw_summaries = TypeAdapter(list[dict[str, JsonValue]]).validate_json(listed.content)
    assert len(summaries) == 1
    assert summaries[0].setup_id == MapSetup.model_validate_json(first.content).setup_id
    assert set(raw_summaries[0]) == {"setup_id", "state", "updated_at"}


def test_concurrent_exact_import_returns_one_created_and_one_replayed_response(
    api_client: TestClient,
    setup_site: Tenant,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Given two identical imports paused after both initial receipt checks and conversions.
    body = {
        **qgz_request("outline-no-zones").model_dump(mode="json"),
        "request_id": str(uuid4()),
        "expected_current_package_id": None,
    }
    barrier = Barrier(2, timeout=10)
    convert = map_setup_imports.convert

    async def synchronized_convert(
        files: list[ProjectFile], mode: Literal["project", "geojson"]
    ) -> ImportData:
        result = await convert(files, mode)
        await anyio.to_thread.run_sync(barrier.wait)
        return result

    # When both reach the database create function concurrently.
    monkeypatch.setattr(map_setup_imports, "convert", synchronized_convert)
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(api_client.post, f"{setup_url(setup_site)}/import", json=body)
            for _ in range(2)
        ]
        responses = [future.result(timeout=30) for future in futures]

    # Then only the winner is new; the lock-waiting exact replay is HTTP 200 with the same ETag.
    assert sorted(response.status_code for response in responses) == [200, 201]
    assert len({response.json()["setup_id"] for response in responses}) == 1
    assert len({response.headers["etag"] for response in responses}) == 1
