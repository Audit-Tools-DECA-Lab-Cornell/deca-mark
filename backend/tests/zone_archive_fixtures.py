"""Archive-worker jobs built from the synthetic zone package, shared by the refusal tests."""

from base64 import b64encode

from fieldmaps_api.domain.packages import ProjectFile
from fieldmaps_api.domain.zone_archive_jobs import ImportJob
from fieldmaps_api.zone_import_schemas import PackageRequest
from tests.test_zone_packages import forms, identity, source, validation


def import_job(request: PackageRequest | None = None) -> ImportJob:
    return ImportJob(
        identity=identity(),
        forms=forms(),
        validation=validation(),
        submission=request or source(),
    )


def with_project(document: str, *leave_out: str) -> PackageRequest:
    """Attach a QGIS project file to the synthetic package, naming the maps to leave out."""
    return source().model_copy(
        update={
            "project_file": ProjectFile(
                file_name="site.qgs", content=b64encode(document.encode())
            ),
            "leave_out_online_basemaps": leave_out,
        }
    )


def with_ground(ring: list[list[float]]) -> PackageRequest:
    """Replace the synthetic package's site outline with one ring."""
    request = source()
    ground = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Polygon", "coordinates": [ring]},
                "properties": {"kind": "site"},
            }
        ],
    }
    return request.model_copy(update={"layers": {**request.layers, "ground": ground}})


def wide_ground() -> PackageRequest:
    return with_ground([[0, 0], [1.5, 0], [1.5, 1.5], [0, 1.5], [0, 0]])


def unclosed_ground() -> PackageRequest:
    return with_ground([[0, 0], [0.8, 0], [0.8, 0.8], [0, 0.8]])
