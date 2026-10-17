from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from threading import Event
from uuid import uuid4
from zipfile import ZipFile

import anyio
import httpx2
import orjson
import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue

from fieldmaps_api.domain.zone_archive_jobs import ImportJob, PublishJob
from fieldmaps_api.domain.zone_package_schemas import PreparedZonePackage
from fieldmaps_api.services import zone_archives
from fieldmaps_api.zone_response_schemas import Publication
from tests.package_fixtures import submission
from tests.zone_api_fixtures import ZoneSite, document, publish_draft, snapshot_history

pytestmark = pytest.mark.integration


def published_form(client: TestClient | httpx2.Client, site: ZoneSite, code: str) -> str:
    definition = {
        "version": "synthetic-v1",
        "title": "Synthetic regression form",
        "summary": "Synthetic regression only",
        "source": "Synthetic test",
        "status": "draft",
        "inclusion": "Synthetic test",
        "questions": [
            {
                "id": "notes",
                "code": "notes",
                "exportColumn": "notes",
                "act": "Record",
                "label": "Notes",
                "kind": "text",
                "source": "Synthetic test",
            }
        ],
    }
    created = client.post(
        f"{site.project_url}/forms",
        json={
            "code": code,
            "name": "Synthetic regression",
            "definition": definition,
        },
    )
    assert created.status_code == 201, created.text
    version = str(document(created.content)["code"])
    result = client.post(
        f"{site.project_url}/form-versions/{version}/publish",
        headers={"If-Match": str(document(created.content)["etag"])},
    )
    assert result.status_code == 200, result.text
    return version


def successor_body(
    client: TestClient | httpx2.Client, site: ZoneSite, current: dict[str, JsonValue], play: str
) -> dict[str, JsonValue]:
    history = client.get(f"{site.url}/zones?package_id={current['package_id']}")
    assert history.status_code == 200, history.text
    zones = document(history.content)["zones"]
    assert isinstance(zones, list)
    zone = zones[0]
    assert isinstance(zone, dict)
    body = document(
        orjson.dumps(
            submission(
                site_id=str(site.tenant.site),
                form_version=play,
                request_id=str(uuid4()),
                expected_current_package_id=current["package_id"],
                change_note="Explicit successor",
                zone_identity_map=[
                    {
                        "source_feature_id": "A",
                        "zone_id": zone["zone_id"],
                        "zone_code": zone["zone_code"],
                    }
                ],
            )
        )
    )
    layers = body["layers"]
    assert isinstance(layers, dict)
    layer = layers["zones"]
    assert isinstance(layer, dict)
    features = layer["features"]
    assert isinstance(features, list)
    feature = features[0]
    assert isinstance(feature, dict)
    properties = feature["properties"]
    assert isinstance(properties, dict)
    properties["name"] = "Synthetic successor lawn"
    return body


def package_forms(client: TestClient, site: ZoneSite, package: str) -> dict[str, JsonValue]:
    result = client.get(f"{site.project_url}/packages/{package}/archive")
    assert result.status_code == 200, result.text
    with ZipFile(BytesIO(result.content)) as archive:
        value = document(archive.read("manifest.json"))["forms"]
    assert isinstance(value, dict)
    return value


def test_current_play_retirement_requires_successor_and_preserves_history(
    api_client: TestClient,
    zone_site: ZoneSite,
) -> None:
    current = publish_draft(api_client, zone_site)
    before = snapshot_history(zone_site.tenant)
    old = package_forms(api_client, zone_site, str(current["package_id"]))
    retired = api_client.post(f"{zone_site.project_url}/form-versions/shell-v1/retire")
    assert retired.status_code == 409, retired.text
    assert "successor" in retired.text.lower()
    play = published_form(api_client, zone_site, "replacement-play")
    body = successor_body(api_client, zone_site, current, play)
    result = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert result.status_code == 201, result.text
    publication = document(result.content)
    successor = publication["package"]
    assert isinstance(successor, dict)
    forms = package_forms(api_client, zone_site, str(successor["package_id"]))
    assert isinstance(forms["play"], dict)
    assert forms["play"]["form_version"] == play
    assert (
        api_client.post(f"{zone_site.project_url}/form-versions/shell-v1/retire").status_code == 200
    )
    replay = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert replay.status_code == 200, replay.text
    replay_publication = Publication.model_validate_json(replay.content)
    assert str(replay_publication.package.package_id) == str(successor["package_id"])
    assert replay_publication.replayed is True
    assert package_forms(api_client, zone_site, str(current["package_id"])) == old
    assert snapshot_history(zone_site.tenant) == before


def test_inventory_can_be_enabled_replaced_inherited_and_disabled(
    api_client: TestClient,
    zone_site: ZoneSite,
) -> None:
    current = publish_draft(api_client, zone_site)
    first = published_form(api_client, zone_site, "inventory-first")
    second = published_form(api_client, zone_site, "inventory-second")
    for selected, expected in [(first, first), ("omitted", first), (second, second), (None, None)]:
        body = successor_body(api_client, zone_site, current, "shell-v1")
        if selected != "omitted":
            body["inventory_form_version"] = selected
        result = api_client.post(f"{zone_site.project_url}/packages", json=body)
        assert result.status_code == 201, result.text
        publication = document(result.content)
        current = publication["package"]
        assert isinstance(current, dict)
        forms = package_forms(api_client, zone_site, str(current["package_id"]))
        if expected is None:
            assert forms["inventory"] is None
        else:
            assert isinstance(forms["inventory"], dict)
            assert forms["inventory"]["form_version"] == expected
            refused = api_client.post(f"{zone_site.project_url}/form-versions/{expected}/retire")
            assert refused.status_code == 409, refused.text
    assert (
        api_client.post(f"{zone_site.project_url}/form-versions/{first}/retire").status_code == 200
    )
    assert (
        api_client.post(f"{zone_site.project_url}/form-versions/{second}/retire").status_code == 200
    )


@pytest.mark.parametrize("field", ["form_version", "inventory_form_version"])
def test_unknown_successor_binding_does_not_activate(
    api_client: TestClient,
    zone_site: ZoneSite,
    field: str,
) -> None:
    current = publish_draft(api_client, zone_site)
    body = successor_body(api_client, zone_site, current, "shell-v1")
    body[field] = "missing-synthetic-form"
    refused = api_client.post(f"{zone_site.project_url}/packages", json=body)
    assert refused.status_code == 422, refused.text
    assert "form_not_in_package" in refused.text
    response = api_client.get(f"/v1/projects/{zone_site.tenant.project}/sites")
    assert str(current["package_id"]) in response.text


def test_retirement_during_successor_preparation_refuses_activation(
    api_client: TestClient,
    zone_site: ZoneSite,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    current = publish_draft(api_client, zone_site)
    play = published_form(api_client, zone_site, "prepared-play")
    body = successor_body(api_client, zone_site, current, play)
    prepared, proceed = Event(), Event()
    original = zone_archives.prepare

    async def paused(
        job: PublishJob | ImportJob, archive: tuple[bytes, str] | None = None
    ) -> PreparedZonePackage:
        result = await original(job, archive)
        prepared.set()
        assert await anyio.to_thread.run_sync(lambda: proceed.wait(10))
        return result

    monkeypatch.setattr(zone_archives, "prepare", paused)
    with ThreadPoolExecutor(max_workers=1) as pool:
        publishing = pool.submit(api_client.post, f"{zone_site.project_url}/packages", json=body)
        try:
            assert prepared.wait(10)
            retired = api_client.post(f"{zone_site.project_url}/form-versions/{play}/retire")
            assert retired.status_code == 200, retired.text
        finally:
            proceed.set()
        response = publishing.result(timeout=15)
    assert response.status_code == 422, response.text
    assert "form_not_in_package" in response.text
    assert (
        str(current["package_id"])
        in api_client.get(f"/v1/projects/{zone_site.tenant.project}/sites").text
    )
