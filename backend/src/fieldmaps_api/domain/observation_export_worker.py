"""Process boundary for bounded export CPU, with no database or credentials."""

import resource
import sys
from pathlib import Path

from fieldmaps_api.domain.observation_export import BYTE_LIMIT, TIME_LIMIT, bundle
from fieldmaps_api.errors import DomainError
from fieldmaps_api.observation_analysis_schemas import ExportSnapshot, ObservationExportQuery


def process(directory: Path) -> None:
    if sys.platform == "linux":
        resource.setrlimit(resource.RLIMIT_CPU, (TIME_LIMIT, TIME_LIMIT))
        resource.setrlimit(resource.RLIMIT_FSIZE, (BYTE_LIMIT, BYTE_LIMIT))
        resource.setrlimit(resource.RLIMIT_AS, (1_073_741_824, 1_073_741_824))
    snapshot = ExportSnapshot.model_validate_json((directory / "snapshot.json").read_bytes())
    filters = ObservationExportQuery.model_validate_json((directory / "filters.json").read_bytes())
    data = bundle(snapshot, filters, (directory / "project.txt").read_text())
    (directory / "export.zip").write_bytes(data)


if __name__ == "__main__":
    try:
        process(Path(sys.argv[1]))
    except (DomainError, MemoryError, OSError):
        sys.exit(2)
