import math
import sys
import time
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import anyio
import pytest

from fieldmaps_api.observation_analysis_schemas import ObservationExportQuery
from tests.test_observation_analysis_domain import snapshot


@pytest.mark.parametrize("count", [601, 10_000])
@pytest.mark.parametrize("export_format", ["csv", "geojson"])
def test_dense_synthetic_serializer_when_answers_and_polygon_are_nontrivial(
    count: int, export_format: str, tmp_path: Path
) -> None:
    # Given synthetic 400-character answers and one deduplicated 2,000-position polygon.
    data = snapshot({"notes": "s" * 400}, {"fields": [{"code": "notes", "type": "text"}]})
    package, zone = uuid4(), uuid4()
    rows = [
        data.items[0].model_copy(
            update={
                "observation_id": uuid4(),
                "package_id": package,
                "zone_id": zone,
                "package_version": 1,
            }
        )
        for _ in range(count)
    ]
    ring = [
        [
            -76 + math.cos(index * 2 * math.pi / 1999) * 0.01,
            42 + math.sin(index * 2 * math.pi / 1999) * 0.01,
        ]
        for index in range(1999)
    ]
    ring.append(ring[0])
    data = data.model_copy(
        update={
            "items": rows,
            "total_matching": count,
            "historical_zones": {
                f"{package}:{zone}": {"type": "MultiPolygon", "coordinates": [[ring]]}
            },
        }
    )
    encoded = data.model_dump_json(by_alias=True, exclude_unset=True).encode()
    data = data.model_copy(update={"source_bytes": len(encoded)})
    encoded = data.model_dump_json(by_alias=True, exclude_unset=True).encode()
    (tmp_path / "snapshot.json").write_bytes(encoded)
    query = ObservationExportQuery.model_validate({"format": export_format})
    (tmp_path / "filters.json").write_text(query.model_dump_json())
    (tmp_path / "project.txt").write_text(str(rows[0].project_id))

    async def run() -> int:
        with anyio.fail_after(10):
            result = await anyio.run_process(
                [
                    sys.executable,
                    "-m",
                    "fieldmaps_api.domain.observation_export_worker",
                    str(tmp_path),
                ],
                check=False,
                env={"PYTHONPATH": str(Path(__file__).parents[1] / "src")},
            )
        return result.returncode

    # When the actual bounded serializer subprocess renders the complete snapshot.
    started = time.monotonic()
    exit_code = anyio.run(run)
    elapsed = time.monotonic() - started
    # Then serialization succeeds within the real ceilings or returns the expected ceiling code.
    assert exit_code in (0, 2)
    if exit_code == 0:
        output = tmp_path / "export.zip"
        with ZipFile(output) as archive:
            asset_bytes = sum(info.file_size for info in archive.infolist())
        print(  # noqa: T201 - acceptance measurement evidence.
            f"BE20 dense serializer rows={count} format={export_format} "
            f"answer_chars=400 polygon_positions=2000 source_bytes={len(encoded)} "
            f"seconds={elapsed:.3f} zip_bytes={output.stat().st_size} asset_bytes={asset_bytes}"
        )
        assert output.stat().st_size <= 32 * 1024 * 1024
        assert asset_bytes <= 32 * 1024 * 1024
    else:
        print(  # noqa: T201 - acceptance measurement evidence.
            f"BE20 dense serializer rows={count} format={export_format} "
            f"source_bytes={len(encoded)} seconds={elapsed:.3f} refused=export_scope_too_large"
        )
