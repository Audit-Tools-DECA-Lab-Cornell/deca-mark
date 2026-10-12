import resource
import sys
from pathlib import Path
from typing import assert_never

import orjson
from pydantic import ValidationError

from fieldmaps_api.domain.packages import PackageError
from fieldmaps_api.domain.zone_archive import extract_base_archive, prepare_import_base
from fieldmaps_api.domain.zone_archive_jobs import (
    JOBS,
    Bootstrap,
    ExtractJob,
    ImportJob,
    PublishJob,
)
from fieldmaps_api.domain.zone_packages import prepare_zone_package


def resource_limits() -> None:
    if sys.platform == "linux":
        resource.setrlimit(resource.RLIMIT_CPU, (20, 20))
        resource.setrlimit(resource.RLIMIT_FSIZE, (16_777_216, 16_777_216))
        resource.setrlimit(resource.RLIMIT_AS, (1_073_741_824, 1_073_741_824))


def process(directory: Path) -> None:
    job = JOBS.validate_json((directory / "job.json").read_bytes())
    match job:
        case ExtractJob():
            base = extract_base_archive((directory / "base.zip").read_bytes())
            bootstrap = Bootstrap(ground=base.ground, zones=base.zones)
            (directory / "bootstrap.json").write_text(bootstrap.model_dump_json())
            return
        case PublishJob():
            base = extract_base_archive((directory / "base.zip").read_bytes())
        case ImportJob():
            base = prepare_import_base(job.submission, job.identity.site_code, job.forms)
        case _:
            assert_never(job)
    prepared = prepare_zone_package(base, job.identity, job.forms, job.validation)
    (directory / "manifest.json").write_text(prepared.manifest.model_dump_json())
    (directory / "zones.json").write_bytes(prepared.zone_layer_bytes)
    (directory / "checks.json").write_bytes(
        orjson.dumps([check.model_dump(mode="json") for check in prepared.checks])
    )
    (directory / "archive.zip").write_bytes(prepared.archive)


if __name__ == "__main__":
    resource_limits()
    try:
        process(Path(sys.argv[1]))
    except (PackageError, ValidationError):
        sys.exit(2)
    except (OSError, MemoryError):
        sys.exit(3)
