"""Bounded subprocess entry point for QGIS conversion; no credentials are inherited."""

import re
import resource
import sys
from base64 import b64encode
from pathlib import Path, PurePosixPath
from typing import Final
from xml.etree.ElementTree import Element

from fiona.errors import FionaError
from pydantic import ValidationError

from fieldmaps_api.domain import qgis_project
from fieldmaps_api.domain.packages import (
    NO_PERMITTED_HOSTS,
    ProjectFile,
    RasterSource,
    is_online_basemap,
)
from fieldmaps_api.domain.project_files import resolve_source, unpack
from fieldmaps_api.domain.project_import import (
    ImportedLayer,
    ImportFailure,
    ImportIssue,
    ProjectImportRequest,
    ProjectImportResult,
)
from fieldmaps_api.domain.project_vectors import convert_vector
from fieldmaps_api.domain.qgis_project import ProjectFileError

MAX_LAYERS: Final = 64


def unconverted_issue(item: Element, name: str, provider: str) -> ImportIssue | None:
    """Explain a layer that is not a file-based vector layer, or return None for one that is.

    An online background map (a tile service drawn on demand) is marked as such, so the web can ask
    before it is left out (D35).
    """
    host = qgis_project.datasource_host(item)
    source = RasterSource(layer_name=name, provider=provider, host=host)
    if qgis_project.layer_kind(item) == "raster" and is_online_basemap(source, NO_PERMITTED_HOSTS):
        return ImportIssue(
            layer=name,
            message=(
                "This is an online background map. It is not converted or uploaded; "
                "observers see the vector layers only."
            ),
            kind="online_basemap",
            host=host,
        )
    if qgis_project.layer_kind(item) != "vector" or provider != "ogr":
        return ImportIssue(
            layer=name,
            message=(
                "This layer was not converted. Only file-based vector layers are "
                "supported; imagery and remote layers remain in QGIS."
            ),
        )
    return None


def import_layers(
    root: Element,
    project: str,
    files: dict[str, bytes],
    directory: Path,
) -> tuple[list[ImportedLayer], list[ImportIssue]]:
    layers: list[ImportedLayer] = []
    issues: list[ImportIssue] = []
    candidates = qgis_project.map_layers(root)
    if len(candidates) > MAX_LAYERS:
        message = (
            "A project may contain at most 64 layers. Save a copy with only this site's layers."
        )
        raise ProjectFileError(message)
    for item in candidates:
        name = qgis_project.layer_name(item) or "Unnamed layer"
        provider = qgis_project.layer_provider(item)
        unconverted = unconverted_issue(item, name, provider)
        if unconverted is not None:
            issues.append(unconverted)
            continue
        source, *options = (item.findtext("datasource") or "").split("|")
        options_map = dict(option.split("=", 1) for option in options if "=" in option)
        if (item.findtext("subsetstring") or "").strip() or any(
            key.lower() in {"subset", "sql"} for key in options_map
        ):
            issues.append(
                ImportIssue(
                    layer=name,
                    message=(
                        "This layer has a filter. Export the filtered layer as GeoJSON "
                        "in QGIS and include that export."
                    ),
                )
            )
            continue
        if (
            re.match(r"^[a-zA-Z][a-zA-Z0-9+.-]*://", source)
            and not source.startswith("attachment:///")
        ) or source.startswith("/vsi"):
            issues.append(
                ImportIssue(
                    layer=name,
                    message=(
                        "Remote sources are not fetched. Include a local copy or a GeoJSON export."
                    ),
                )
            )
            continue
        filename = resolve_source(source, project, files)
        if filename is None:
            missing = PurePosixPath(source.replace(chr(92), "/")).name or "the source file"
            issues.append(
                ImportIssue(
                    layer=name,
                    message=(
                        f"Include {missing} with this project, or supply its GeoJSON export. "
                        "No matching, unambiguous file was uploaded."
                    ),
                )
            )
            continue
        selector: str | int | None = options_map.get("layername")
        if selector is None and options_map.get("layerid", "").isdigit():
            selector = int(options_map["layerid"])
        try:
            assigned_crs = item.findtext("srs/spatialrefsys/wkt") or item.findtext(
                "srs/spatialrefsys/authid"
            )
            collection = convert_vector(directory / filename, selector, assigned_crs)
        except ProjectFileError as error:
            issues.append(ImportIssue(layer=name, message=str(error)))
            continue
        except (FionaError, ValidationError, ValueError, OSError):
            # Native diagnostics may contain paths; keep them out of the response.
            issues.append(
                ImportIssue(
                    layer=name,
                    message=(
                        "This layer could not be read or reprojected. Include all shapefile "
                        "parts, check its CRS, or supply a GeoJSON export."
                    ),
                )
            )
            continue
        layers.append(ImportedLayer(name=name, collection=collection))
    return layers, issues


def convert(submission: ProjectImportRequest, directory: Path) -> ProjectImportResult:
    files = unpack(submission.files)
    projects = [name for name in files if name.lower().endswith(".qgs")]
    if len(projects) != 1:
        message = (
            "Include exactly one .qgz or .qgs project, optionally zipped with its source files."
        )
        raise ProjectFileError(message)
    project = projects[0]
    document = qgis_project.read_document(files[project])
    root = qgis_project.parse(document)
    for name, payload in files.items():
        destination = directory / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(payload)
    layers, issues = import_layers(root, project, files, directory)
    return ProjectImportResult(
        project_file=ProjectFile(
            file_name=PurePosixPath(project).name, content=b64encode(files[project])
        ),
        layers=layers,
        issues=issues,
    )


def bounded_output(result: ProjectImportResult) -> str:
    output = result.model_dump_json()
    if len(output.encode()) > 16 * 1024 * 1024:
        message = "The converted layers exceed 16 MB. Simplify the layers in QGIS and try again."
        raise ProjectFileError(message)
    return output


def main() -> int:
    resource.setrlimit(resource.RLIMIT_CPU, (40, 40))
    resource.setrlimit(resource.RLIMIT_FSIZE, (64 * 1024 * 1024, 64 * 1024 * 1024))
    if sys.platform == "linux":
        resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
    try:
        submission = ProjectImportRequest.model_validate_json(
            sys.stdin.buffer.read(24 * 1024 * 1024 + 1)
        )
        result = convert(submission, Path(sys.argv[1]))
        output = bounded_output(result)
    except (ProjectFileError, ValidationError) as error:
        sys.stdout.write(ImportFailure(error=str(error)).model_dump_json())
        return 2
    sys.stdout.write(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
