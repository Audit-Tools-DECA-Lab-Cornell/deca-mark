import sys
from hashlib import sha256
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Final

import anyio
from pydantic import TypeAdapter

from fieldmaps_api.domain.packages import (
    InvalidShapeError,
    OnlineBasemapError,
    PackageError,
    PreparationCheck,
)
from fieldmaps_api.domain.zone_archive_jobs import (
    BASEMAPS,
    JOBS,
    ONLINE_BASEMAPS_FILE,
    REASON_FILE,
    ImportJob,
    Job,
    PublishJob,
)
from fieldmaps_api.domain.zone_package_schemas import (
    PreparedZonePackage,
    ZoneLayer,
    ZonePackageManifest,
)
from fieldmaps_api.errors import StorageUnavailableError

INVALID_SOURCE: Final = 2
ARCHIVE_TIMEOUT_SECONDS: Final = 30
SOURCE_ROOT: Final = str(Path(__file__).resolve().parents[2])
CHECKS: Final = TypeAdapter(tuple[PreparationCheck, ...])
MAX_REASON_CHARACTERS: Final = 2_000
UNREADABLE_SHAPE: Final = "The retained or submitted package is not a valid publication source"


async def refusal(directory: Path) -> PackageError:
    """Read why the worker refused: its own sentence, an online map question, or neither.

    A worker that could not read a shape leaves nothing behind, and that alone is the ring refusal.
    """
    basemaps = anyio.Path(directory / ONLINE_BASEMAPS_FILE)
    if await basemaps.exists():
        return OnlineBasemapError(BASEMAPS.validate_json(await basemaps.read_bytes()))
    reason = anyio.Path(directory / REASON_FILE)
    if await reason.exists():
        text = (await reason.read_text(encoding="utf-8", errors="replace")).strip()
        if text:
            return PackageError(text[:MAX_REASON_CHARACTERS])
    return InvalidShapeError(UNREADABLE_SHAPE)


async def run(directory: Path, job: Job, archive: tuple[bytes, str] | None) -> None:
    if archive is not None:
        payload, digest = archive
        if sha256(payload).hexdigest() != digest:
            message = "The retained package checksum does not match"
            raise PackageError(message)
        await anyio.Path(directory / "base.zip").write_bytes(payload)
    await anyio.Path(directory / "job.json").write_bytes(JOBS.dump_json(job))
    try:
        with anyio.fail_after(ARCHIVE_TIMEOUT_SECONDS):
            result = await anyio.run_process(
                [sys.executable, "-m", "fieldmaps_api.domain.zone_archive_worker", str(directory)],
                env={"PYTHONPATH": SOURCE_ROOT},
                check=False,
            )
    except TimeoutError as error:
        message = "Archive processing timed out; retry later"
        raise StorageUnavailableError(message) from error
    if result.returncode == INVALID_SOURCE:
        raise await refusal(directory)
    if result.returncode != 0:
        message = "Archive processing unavailable; retry later"
        raise StorageUnavailableError(message)


async def prepare(
    job: PublishJob | ImportJob, archive: tuple[bytes, str] | None = None
) -> PreparedZonePackage:
    with TemporaryDirectory(prefix="zone-archive-") as temporary:
        directory = Path(temporary)
        await run(directory, job, archive)
        manifest = ZonePackageManifest.model_validate_json(
            await anyio.Path(directory / "manifest.json").read_bytes()
        )
        layer_bytes = await anyio.Path(directory / "zones.json").read_bytes()
        layer = ZoneLayer.model_validate_json(layer_bytes)
        checks = CHECKS.validate_json(await anyio.Path(directory / "checks.json").read_bytes())
        payload = await anyio.Path(directory / "archive.zip").read_bytes()
        return PreparedZonePackage(
            manifest, layer, layer_bytes, checks, payload, sha256(payload).hexdigest()
        )
