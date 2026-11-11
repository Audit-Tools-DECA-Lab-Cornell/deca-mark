import os
from base64 import b64encode
from contextlib import AbstractContextManager
from pathlib import Path

import anyio
import pytest

from fieldmaps_api.domain.project_import import ProjectImportRequest
from fieldmaps_api.errors import StorageUnavailableError, ValidationFailedError
from fieldmaps_api.services import project_import
from tests.map_setup_fixtures import qgz_request


def submission(size: int = 156_500) -> ProjectImportRequest:
    return ProjectImportRequest.model_validate(
        {
            "files": [
                {
                    "file_name": "site.qgs",
                    "content": b64encode(b"<qgis>" + b" " * size + b"</qgis>"),
                }
            ],
        }
    )


def use_worker(tmp_path: Path, monkeypatch: pytest.MonkeyPatch, source: str) -> None:
    package = tmp_path / "fieldmaps_api"
    domain = package / "domain"
    domain.mkdir(parents=True)
    (package / "__init__.py").write_text("")
    (domain / "__init__.py").write_text("")
    (domain / "project_worker.py").write_text(source)
    monkeypatch.setattr(project_import, "SOURCE_ROOT", str(tmp_path))


@pytest.mark.parametrize("input_size", [100, 156_500])
@pytest.mark.parametrize("exit_code", [0, 1, 2])
def test_startup_exit_is_service_unavailable_without_exposing_worker_diagnostics(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, input_size: int, exit_code: int
) -> None:
    use_worker(
        tmp_path,
        monkeypatch,
        f"import sys\nsys.stderr.write('private-source.gpkg\\n' * 10_000)\nsys.exit({exit_code})\n",
    )
    with pytest.raises(StorageUnavailableError) as failure:
        anyio.run(project_import.import_project, submission(input_size))
    assert failure.value.status == 503
    assert failure.value.code == "storage_unavailable"
    assert (
        failure.value.message
        == "The QGIS project reader is temporarily unavailable. Try again later."
    )
    assert "private-source.gpkg" not in failure.value.message


def test_explicit_invalid_project_remains_validation_refusal_when_worker_exits_early(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    use_worker(
        tmp_path,
        monkeypatch,
        "import sys\n"
        'sys.stdout.write(\'{"error":"Choose exactly one QGIS project."}\')\n'
        "sys.exit(2)\n",
    )
    with pytest.raises(ValidationFailedError, match="Choose exactly one QGIS project") as failure:
        anyio.run(project_import.import_project, submission())
    assert failure.value.status == 422


def test_real_importer_success_still_returns_converted_layers() -> None:
    result = anyio.run(project_import.import_project, qgz_request("complete"))
    assert len(result.layers) == 3
    assert not result.issues


def test_real_importer_invalid_project_still_returns_validation_refusal() -> None:
    invalid = ProjectImportRequest.model_validate(
        {
            "files": [{"file_name": "site.qgs", "content": b64encode(b"<qgis>")}],
        }
    )
    with pytest.raises(ValidationFailedError) as failure:
        anyio.run(project_import.import_project, invalid)
    assert failure.value.status == 422


def test_timeout_keeps_its_specific_validation_refusal_and_reaps_the_worker(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    marker = tmp_path / "worker.pid"
    use_worker(
        tmp_path,
        monkeypatch,
        "import os, time\nfrom pathlib import Path\n"
        f"Path({str(marker)!r}).write_text(str(os.getpid()))\n"
        "time.sleep(30)\n",
    )
    original_deadline = anyio.fail_after

    def short_deadline(
        _delay: float | None, *, shield: bool = False
    ) -> AbstractContextManager[anyio.CancelScope]:
        return original_deadline(2, shield=shield)

    monkeypatch.setattr(anyio, "fail_after", short_deadline)
    with pytest.raises(ValidationFailedError, match="took too long") as failure:
        anyio.run(project_import.import_project, submission())
    assert failure.value.status == 422
    with pytest.raises(ProcessLookupError):
        os.kill(int(marker.read_text()), 0)


def test_request_cancellation_propagates_and_reaps_the_worker(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    marker = tmp_path / "worker.pid"
    use_worker(
        tmp_path,
        monkeypatch,
        "import os, time\nfrom pathlib import Path\n"
        f"Path({str(marker)!r}).write_text(str(os.getpid()))\n"
        "time.sleep(30)\n",
    )

    async def cancel_running_import() -> None:
        async with anyio.create_task_group() as tasks:
            tasks.start_soon(project_import.import_project, submission())
            with anyio.fail_after(5):
                while not await anyio.Path(marker).exists():
                    await anyio.lowlevel.checkpoint()
            tasks.cancel_scope.cancel()

    anyio.run(cancel_running_import)
    with pytest.raises(ProcessLookupError):
        os.kill(int(marker.read_text()), 0)
