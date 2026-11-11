# /// script
# requires-python = ">=3.13"
# dependencies = []
# ///
# How to run: sh backend/tests/runtime-import-smoke.sh (uses the locked runtime image).

import logging
import os
from base64 import b64encode
from importlib import import_module
from importlib.metadata import version
from pathlib import Path
from typing import Final

import anyio

from fieldmaps_api.domain.project_import import ProjectImportRequest
from fieldmaps_api.services.project_import import import_project

FIXTURES: Final = Path("/fixtures")
LAYER_NAMES: Final = {"ground", "zones", "paths", "trees"}
LOGGER: Final = logging.getLogger(__name__)


def submission(extension: str) -> ProjectImportRequest:
    filename = f"janet-synthetic-playground.{extension}"
    return ProjectImportRequest.model_validate(
        {
            "files": [
                {
                    "file_name": filename,
                    "content": b64encode((FIXTURES / filename).read_bytes()).decode(),
                }
            ]
        }
    )


async def complete_qgz_imports_all_layers() -> None:
    result = await import_project(submission("qgz"))
    assert not result.issues, result.issues
    assert len(result.layers) == 4
    assert {layer.name: len(layer.collection.features) for layer in result.layers} == {
        "ground": 6,
        "zones": 2,
        "paths": 1,
        "trees": 4,
    }
    first_tree = next(
        layer for layer in result.layers if layer.name == "trees"
    ).collection.features[0]
    assert first_tree.properties["id"] == "demo-tree-1"
    assert first_tree.geometry.model_dump(mode="json") == {
        "type": "Point",
        "coordinates": [-76.50045, 42.44632],
    }
    LOGGER.info("PASS complete QGZ: layer counts and known tree coordinates retained")


async def standalone_qgs_reports_missing_sources() -> None:
    result = await import_project(submission("qgs"))
    assert not result.layers
    assert len(result.issues) == 4
    assert {issue.layer for issue in result.issues} == LAYER_NAMES
    assert all(f"{issue.layer}.geojson" in issue.message for issue in result.issues)
    LOGGER.info("PASS standalone QGS: four named missing sources, no converter crash")


async def main() -> None:
    assert os.getuid() == 10001
    import_module("fiona")
    LOGGER.info("Runtime UID %s; Fiona %s", os.getuid(), version("fiona"))
    await complete_qgz_imports_all_layers()
    await standalone_qgs_reports_missing_sources()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    anyio.run(main)
