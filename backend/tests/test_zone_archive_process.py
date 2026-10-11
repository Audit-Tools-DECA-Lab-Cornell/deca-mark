from hashlib import sha256

import anyio
import pytest

from fieldmaps_api.domain.packages import PackageError, PackageSubmission, prepare
from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.services import zone_archives
from fieldmaps_api.services.zones import ZoneWork
from tests.test_site_packages import submission


def test_real_archive_subprocess_reads_actual_ground() -> None:
    package = prepare(PackageSubmission.model_validate(submission()))
    result = anyio.run(zone_archives.extract, (package.archive, package.archive_sha256))
    assert result.ground.type == "Polygon"
    assert result.legacy_zones[0].zone_code == "A"


def test_corrupted_archive_subprocess_returns_safe_failure() -> None:
    payload = b"invalid-archive"
    with pytest.raises(PackageError, match="not a valid publication source"):
        anyio.run(zone_archives.extract, (payload, sha256(payload).hexdigest()))


def test_archive_subprocess_deadline_is_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    package = prepare(PackageSubmission.model_validate(submission()))
    monkeypatch.setattr(zone_archives, "ARCHIVE_TIMEOUT_SECONDS", 0.001)
    with pytest.raises(StorageUnavailableError, match="timed out"):
        anyio.run(zone_archives.extract, (package.archive, package.archive_sha256))


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
