from base64 import b64encode
from io import BytesIO
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.map_setup_schemas import MapSetup
from tests.map_setup_fixtures import qgz_request
from tests.tenant_fixtures import Tenant
from tests.test_map_setup_api import import_setup, setup_url

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_map_setup_api",)


@pytest.mark.parametrize(
    ("file_name", "project_name"),
    [
        ("renamed.qgz", "renamed.qgs"),
        ("outline-no-zones.qgz", "site.qgs"),
        ("project-folder.zip", "folder/site.qgs"),
        ("replacement.qgs", "replacement.qgs"),
    ],
)
def test_replacement_project_replaces_sources_after_confirmation_and_keeps_boundaries(
    api_client: TestClient, setup_site: Tenant, file_name: str, project_name: str
) -> None:
    # Given a saved setup with drawn boundaries and an older project archive.
    url, etag, setup = import_setup(api_client, setup_site)
    geometry = setup.layers[0].features[0].feature.geometry.model_dump(mode="json")
    content = {
        **setup.content.model_dump(mode="json"),
        "outline": geometry,
        "zones": [
            {
                "zone_id": str(uuid4()),
                "zone_code": "DRAWN",
                "zone_label": "Lawn",
                "geometry": geometry,
            }
        ],
    }
    saved = api_client.put(url, headers={"If-Match": etag}, json=content)
    assert saved.status_code == 200, saved.text
    acknowledged = MapSetup.model_validate_json(saved.content)
    with ZipFile(BytesIO(qgz_request("complete").files[0].content)) as archive:
        entries = {
            project_name if name == "site.qgs" else name: archive.read(name)
            for name in archive.namelist()
        }
    if file_name.endswith(".qgs"):
        files = [
            {"file_name": name, "content": b64encode(data).decode()}
            for name, data in entries.items()
        ]
    else:
        output = BytesIO()
        with ZipFile(output, "w") as archive:
            for name, data in entries.items():
                archive.writestr(name, data)
        files = [{"file_name": file_name, "content": b64encode(output.getvalue()).decode()}]
    preview = {"request_id": str(uuid4()), "files": files, "replace_project": True}
    # When the renamed replacement is previewed and confirmed.
    candidate = api_client.post(
        f"{url}/sources", headers={"If-Match": saved.headers["etag"]}, json=preview
    )
    assert candidate.status_code == 200, candidate.text
    assert MapSetup.model_validate_json(api_client.get(url).content) == acknowledged
    commit = {
        **preview,
        "request_id": str(uuid4()),
        "preview": False,
        "candidate_hash": candidate.json()["candidate_hash"],
    }
    replaced = api_client.post(
        f"{url}/sources", headers={"If-Match": saved.headers["etag"]}, json=commit
    )
    # Then only replacement files remain and manual work survives, including on exact retry.
    assert replaced.status_code == 200, replaced.text
    result = MapSetup.model_validate_json(replaced.content)
    assert len(result.layers) == 3
    assert not result.issues
    assert {source.file_name for source in result.sources} == {file["file_name"] for file in files}
    assert result.import_generation == 2
    assert result.content.outline == acknowledged.content.outline
    assert result.content.zones == acknowledged.content.zones
    replay = api_client.post(
        f"{url}/sources", headers={"If-Match": saved.headers["etag"]}, json=commit
    )
    assert replay.status_code == 200, replay.text
    assert MapSetup.model_validate_json(replay.content) == result


def test_zipped_missing_data_is_added_without_replacing_the_project(
    api_client: TestClient, setup_site: Tenant
) -> None:
    created = api_client.post(
        f"{setup_url(setup_site)}/import",
        json={
            **qgz_request("missing-source").model_dump(mode="json"),
            "request_id": str(uuid4()),
            "expected_current_package_id": None,
        },
    )
    assert created.status_code == 201, created.text
    setup = MapSetup.model_validate_json(created.content)
    url = f"{setup_url(setup_site)}/{setup.setup_id}"
    with ZipFile(BytesIO(qgz_request("complete").files[0].content)) as archive:
        trees = archive.read("trees.geojson")
    output = BytesIO()
    with ZipFile(output, "w") as archive:
        archive.writestr("trees.geojson", trees)
    preview = {
        "request_id": str(uuid4()),
        "files": [
            {"file_name": "missing-data.zip", "content": b64encode(output.getvalue()).decode()}
        ],
    }
    candidate = api_client.post(
        f"{url}/sources", headers={"If-Match": created.headers["etag"]}, json=preview
    )
    assert candidate.status_code == 200, candidate.text
    commit = {
        **preview,
        "request_id": str(uuid4()),
        "preview": False,
        "candidate_hash": candidate.json()["candidate_hash"],
    }
    response = api_client.post(
        f"{url}/sources", headers={"If-Match": created.headers["etag"]}, json=commit
    )
    assert response.status_code == 200, response.text
    recovered = MapSetup.model_validate_json(response.content)
    assert len(recovered.layers) == 2
    assert not recovered.issues
    assert {source.file_name for source in recovered.sources} == {
        "missing-source.qgz",
        "missing-data.zip",
    }
    replay = api_client.post(
        f"{url}/sources",
        headers={"If-Match": created.headers["etag"]},
        json={**commit, "replace_project": False},
    )
    assert replay.status_code == 200, replay.text
    assert MapSetup.model_validate_json(replay.content) == recovered
