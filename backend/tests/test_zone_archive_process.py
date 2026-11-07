from functools import partial
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Final
from zipfile import ZipFile

import anyio
import pytest

from fieldmaps_api.domain.packages import MAX_ARCHIVE_BYTES, PackageError
from fieldmaps_api.domain.zone_archive_jobs import ImportJob, PublishJob
from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.services import zone_archives
from fieldmaps_api.services.zones import ZoneWork
from tests.test_zone_packages import forms, identity, prepared, source, validation
from tests.zone_archive_fixtures import import_job, wide_ground, with_project


def test_real_archive_subprocess_reads_actual_ground() -> None:
    request = source()
    result = anyio.run(
        zone_archives.prepare,
        ImportJob(
            identity=identity(),
            forms=forms(),
            validation=validation(),
            submission=request,
        ),
    )
    published = anyio.run(
        zone_archives.prepare,
        PublishJob(identity=identity(), forms=forms(), validation=validation()),
        (result.archive, result.archive_sha256),
    )
    assert published.manifest.zones[0].zone_code == "A0"
    assert published.zone_layer == result.zone_layer
    with (
        ZipFile(BytesIO(result.archive)) as original,
        ZipFile(BytesIO(published.archive)) as successor,
    ):
        for layer in ("ground", "paths", "trees"):
            assert successor.read(f"layers/{layer}.json") == original.read(f"layers/{layer}.json")


def test_corrupted_archive_subprocess_returns_safe_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        zone_archives, "TemporaryDirectory", partial(TemporaryDirectory, dir=tmp_path)
    )
    payload = b"invalid-archive"
    with pytest.raises(PackageError, match="not a readable zone package") as refused:
        anyio.run(
            zone_archives.prepare,
            PublishJob(identity=identity(), forms=forms(), validation=validation()),
            (payload, sha256(payload).hexdigest()),
        )
    assert type(refused.value) is PackageError
    assert list(tmp_path.iterdir()) == []


def test_archive_subprocess_deadline_is_enforced(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    result = prepared()
    monkeypatch.setattr(
        zone_archives, "TemporaryDirectory", partial(TemporaryDirectory, dir=tmp_path)
    )
    monkeypatch.setattr(zone_archives, "ARCHIVE_TIMEOUT_SECONDS", 0.001)
    with pytest.raises(StorageUnavailableError, match="timed out"):
        anyio.run(
            zone_archives.prepare,
            PublishJob(identity=identity(), forms=forms(), validation=validation()),
            (result.archive, result.archive_sha256),
        )
    assert list(tmp_path.iterdir()) == []


def test_shared_zone_capacity_refuses_a_third_worker() -> None:
    async def blocked() -> None:
        work = ZoneWork()
        work.limiter.acquire_on_behalf_of_nowait(1)
        work.limiter.acquire_on_behalf_of_nowait(2)
        try:
            with pytest.raises(StorageUnavailableError, match="busy"):
                async with work.slot():
                    pytest.fail("A third worker must not start")
        finally:
            work.limiter.release_on_behalf_of(1)
            work.limiter.release_on_behalf_of(2)

    anyio.run(blocked)


OVERSIZE: Final = bytes(MAX_ARCHIVE_BYTES + 1)


@pytest.mark.parametrize(
    ("job", "archive", "message"),
    [
        (
            PublishJob(identity=identity(), forms=forms(), validation=validation()),
            (OVERSIZE, sha256(OVERSIZE).hexdigest()),
            "The retained archive exceeds the package size ceiling",
        ),
        (
            import_job(wide_ground()),
            None,
            "The site and zones exceed the supported publication extent",
        ),
        (
            import_job(with_project("<qgis><layers></qgis>")),
            None,
            "The project file is not readable XML",
        ),
        (
            import_job(with_project('<!DOCTYPE qgis [<!ENTITY a "b">]><qgis/>')),
            None,
            "The project file declares XML entities, which DECA Mark does not read",
        ),
    ],
    ids=["archive size", "publication extent", "project parse", "project entities"],
)
def test_a_worker_refusal_reaches_the_caller_with_its_own_reason(
    job: ImportJob | PublishJob, archive: tuple[bytes, str] | None, message: str
) -> None:
    with pytest.raises(PackageError, match=message) as refused:
        anyio.run(zone_archives.prepare, job, archive)
    # Exactly a PackageError: not the ring refusal, which has no reason of its own to show.
    assert type(refused.value) is PackageError
