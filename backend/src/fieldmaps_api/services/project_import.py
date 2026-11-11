"""Run native file conversion outside the API process with time and resource limits."""

import os
import sys
from pathlib import Path
from tempfile import TemporaryDirectory, TemporaryFile
from typing import Final

import anyio
from pydantic import ValidationError

from fieldmaps_api.domain.project_import import (
    ImportFailure,
    ProjectImportRequest,
    ProjectImportResult,
)
from fieldmaps_api.errors import StorageUnavailableError, ValidationFailedError

IMPORT_LIMITER: Final = anyio.CapacityLimiter(2)
SOURCE_ROOT: Final = str(Path(__file__).resolve().parents[2])
INVALID_IMPORT: Final = 2
UNAVAILABLE_MESSAGE: Final = "The QGIS project reader is temporarily unavailable. Try again later."


async def import_project(submission: ProjectImportRequest) -> ProjectImportResult:
    try:
        with anyio.fail_after(45):
            async with IMPORT_LIMITER:
                with (
                    TemporaryDirectory(prefix="fieldmaps-import-") as temporary,
                    TemporaryFile() as source,
                ):
                    source.write(submission.model_dump_json().encode())
                    source.seek(0)
                    process = await anyio.run_process(
                        [sys.executable, "-m", "fieldmaps_api.domain.project_worker", temporary],
                        stdin=source,
                        env={
                            "PATH": os.defpath,
                            "PYTHONPATH": SOURCE_ROOT,
                            "PROJ_NETWORK": "OFF",
                            "GDAL_PAM_ENABLED": "NO",
                            "GDAL_HTTP_TIMEOUT": "1",
                        },
                        check=False,
                    )
        if process.returncode == INVALID_IMPORT:
            raise ValidationFailedError(ImportFailure.model_validate_json(process.stdout).error)
        if process.returncode != 0:
            raise StorageUnavailableError(UNAVAILABLE_MESSAGE)
        return ProjectImportResult.model_validate_json(process.stdout)
    except TimeoutError as error:
        message = (
            "The project took too long to convert. Export smaller layers or upload GeoJSON instead."
        )
        raise ValidationFailedError(message) from error
    except (OSError, ValidationError) as error:
        raise StorageUnavailableError(UNAVAILABLE_MESSAGE) from error
