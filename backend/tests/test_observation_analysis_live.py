import csv
import os
import socket
import sys
from collections.abc import Mapping, Sequence
from io import StringIO
from pathlib import Path
from subprocess import CompletedProcess
from threading import Event
from urllib.parse import urlparse
from uuid import uuid4

import anyio
import pytest

from fieldmaps_api.observation_analysis_schemas import ObservationPage, ObservationSummary
from fieldmaps_api.zone_response_schemas import Publication
from tests.bound_upload_fixtures import BoundSite
from tests.observation_analysis_fixtures import AnalysisSite, seed_copies
from tests.test_observation_analysis_domain import canonical, question
from tests.test_observation_analysis_exports import files
from tests.test_zone_api_live import LiveApi
from tests.test_zone_form_succession import successor_body
from tests.zone_api_fixtures import document

pytest_plugins = ("tests.bound_upload_live_fixtures",)


pytestmark = pytest.mark.integration


def test_signed_live_complete_reads_when_offline_upload_is_historical(
    live_api: LiveApi, live_bound_site: BoundSite
) -> None:
    # Given a signed live HTTP package publication and historical offline upload.
    point = uuid4()
    site = AnalysisSite(live_bound_site, point)
    with live_api.client("observer") as collector:
        response = collector.put(live_bound_site.url(point), json=live_bound_site.point())
        assert response.status_code == 200, response.text
    seed_copies(site, 600)
    # When another authorized reader queries page, summary and complete export.
    with live_api.client("viewer") as reader:
        page = reader.get(
            site.url, params={"package_id": str(live_bound_site.package), "limit": 500}
        )
        summary = reader.get(
            site.url + "/summary", params={"package_id": str(live_bound_site.package)}
        )
        exported = reader.get(
            site.url + "/export",
            params={"format": "geojson", "package_id": str(live_bound_site.package)},
        )
    # Then the real signed Uvicorn pipeline returns consistent complete scopes.
    assert page.status_code == summary.status_code == exported.status_code == 200
    assert ObservationPage.model_validate_json(page.content).total_matching == 601
    assert ObservationSummary.model_validate_json(summary.content).total_matching == 601
    assert "observations.geojson" in files(exported.content)


@pytest.mark.parametrize("cancel_reason", ["disconnect", "timeout"])
def test_disconnect_terminates_worker_when_signed_peer_closes_socket(
    live_api: LiveApi,
    live_bound_site: BoundSite,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
    cancel_reason: str,
) -> None:
    # Given a real exporter child that signals readiness then waits for cancellation.
    started, finished = Event(), Event()
    pid_file = tmp_path / "export-child.pid"
    assert live_bound_site.site.tenant == live_api.tenant
    run_process = anyio.run_process
    directories: list[Path] = []
    pids: list[int] = []

    async def slow_process(
        command: str | bytes | Sequence[str | bytes],
        *,
        check: bool = True,
        env: Mapping[str, str] | None = None,
    ) -> CompletedProcess[bytes]:
        assert not isinstance(command, str | bytes)
        assert not check
        directory = Path(str(command[-1]))
        directories.append(directory)
        try:
            async with await anyio.open_process(
                [
                    sys.executable,
                    "-c",
                    (
                        "import os,sys,time; "
                        "open(sys.argv[1],'w').write(str(os.getpid())); time.sleep(60)"
                    ),
                    str(pid_file),
                ],
                env=env,
            ) as process:
                pids.append(process.pid)
                started.set()
                await process.wait()
                return CompletedProcess(command, process.returncode or 0, b"", b"")
        finally:
            finished.set()

    monkeypatch.setattr(
        "fieldmaps_api.services.observation_exports.anyio.run_process", slow_process
    )
    address = urlparse(live_api.url)
    assert address.port is not None
    # When the signed peer disconnects while its exporter is running.
    if cancel_reason == "disconnect":
        with socket.create_connection(("127.0.0.1", address.port), timeout=5) as peer:
            token = live_api.signer.issue(live_api.tenant.users["manager"])
            request = (
                f"GET /v1/projects/{live_api.tenant.project}/observations/export HTTP/1.1\r\n"
                f"Host: localhost\r\nAuthorization: Bearer {token}\r\n\r\n"
            )
            peer.sendall(request.encode())
            assert started.wait(5)
    else:
        monkeypatch.setattr("fieldmaps_api.services.observation_exports.TIME_LIMIT", 0.5)
        with live_api.client() as reader:
            refused = reader.get(f"/v1/projects/{live_api.tenant.project}/observations/export")
        assert refused.status_code == 422, refused.text
        assert "export_scope_too_large" in refused.text
        assert started.is_set()
        monkeypatch.setattr("fieldmaps_api.services.observation_exports.TIME_LIMIT", 10)
    assert finished.wait(5)
    monkeypatch.setattr("fieldmaps_api.services.observation_exports.anyio.run_process", run_process)
    # Then the child/temp directory/capacity are reclaimed and a real subsequent export succeeds.
    with live_api.client() as reader:
        response = reader.get(f"/v1/projects/{live_api.tenant.project}/observations/export")
    assert response.status_code == 200, response.text
    assert all(not directory.exists() for directory in directories)
    for pid in pids:
        with pytest.raises(ProcessLookupError):
            os.kill(pid, 0)


def test_signed_canonical_dynamic_export_when_historical_form_is_published(
    live_api: LiveApi, live_bound_site: BoundSite
) -> None:
    # Given a canonical dynamic form published and pinned through the real signed HTTP pipeline.
    site = live_bound_site.site
    definition = canonical(
        [question("parent", "parent", "one"), question("child", "fallback", "one")]
    )
    questions = definition["questions"]
    assert isinstance(questions, list)
    parent, child = questions
    assert isinstance(parent, dict)
    assert isinstance(child, dict)
    parent["options"] = [{"code": "p", "label": "Parent"}]
    child["dynamicFrom"] = {
        "question": "parent",
        "sets": {
            "p": {
                "code": "p",
                "exportColumn": "named",
                "label": "Named historical set",
                "options": [{"code": "x", "label": "X"}],
            }
        },
    }
    definition["researchMetadata"] = {"synthetic": True}
    child["researchNote"] = "Captured extension"
    definition["status"] = "draft"
    with live_api.client() as manager:
        created = manager.post(
            site.project_url + "/forms",
            json={
                "code": "synthetic-dynamic",
                "name": "Synthetic dynamic",
                "definition": definition,
            },
        )
        assert created.status_code == 201, created.text
        code = str(document(created.content)["code"])
        published = manager.post(
            site.project_url + f"/form-versions/{code}/publish",
            headers={"If-Match": str(document(created.content)["etag"])},
        )
        assert published.status_code == 200, published.text
        body = successor_body(manager, site, {"package_id": str(live_bound_site.package)}, code)
        package = manager.post(site.project_url + "/packages", json=body)
        assert package.status_code == 201, package.text
        package_id = str(Publication.model_validate_json(package.content).package.package_id)
        observation = uuid4()
        uploaded = manager.put(
            live_bound_site.url(observation),
            json=live_bound_site.point(
                package_id=package_id, form_version=code, answers={"parent": "p", "child": "x"}
            ),
        )
        assert uploaded.status_code == 200, uploaded.text
        detail = manager.get(f"/v1/projects/{site.tenant.project}/observations/{observation}")
        assert detail.status_code == 200, detail.text
        recorded = document(detail.content)["definition"]
        # When that canonical historical scope is exported in a subprocess.
        exported = manager.get(
            f"/v1/projects/{site.tenant.project}/observations/export",
            params={"package_id": package_id},
        )
    # Then aliases and omitted fields survive with the dynamic named column.
    assert exported.status_code == 200, exported.text
    assets = files(exported.content)
    row = next(csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig"))))
    assert row["named"] == "x"
    forms = document(assets["forms.json"])
    assert forms[code] == recorded
    frozen = forms[code]
    assert isinstance(frozen, dict)
    assert frozen["researchMetadata"] == {"synthetic": True}
    captured_questions = frozen["questions"]
    assert isinstance(captured_questions, list)
    captured_child = captured_questions[1]
    assert isinstance(captured_child, dict)
    assert captured_child["researchNote"] == "Captured extension"
