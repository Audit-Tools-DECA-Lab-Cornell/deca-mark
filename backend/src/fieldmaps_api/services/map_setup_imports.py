"""Normalize bounded import results for durable setup review."""

import hashlib
from typing import ClassVar, Final, Literal, assert_never

import orjson
from pydantic import BaseModel, ConfigDict, ValidationError

from fieldmaps_api.domain import qgis_project
from fieldmaps_api.domain.geojson import FeatureCollection, declared_crs_is_wgs84, positions
from fieldmaps_api.domain.packages import MAX_FEATURES_PER_LAYER, ProjectFile
from fieldmaps_api.domain.project_files import safe_path
from fieldmaps_api.domain.project_import import ProjectImportRequest
from fieldmaps_api.domain.qgis_project import ProjectFileError
from fieldmaps_api.errors import ValidationFailedError
from fieldmaps_api.map_setup_schemas import MAX_SETUP_FEATURES, SetupFeature, SetupIssue, SetupLayer
from fieldmaps_api.services.project_import import import_project

MAX_FILES: Final = 64
MAX_LONGITUDE_SPAN: Final = 180
MAX_CONVERTED_BYTES: Final = 16 * 1024 * 1024
MAX_PROJECT_BYTES: Final = 8 * 1024 * 1024


class ImportData(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    layers: list[SetupLayer]
    issues: list[SetupIssue]
    project_file: ProjectFile | None


def digest(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def scoped_source_id(project_fingerprint: str, qgis_source_id: str) -> str:
    """Keep a stable QGIS identity bounded before it enters the durable setup contract."""
    return f"{project_fingerprint}:{digest(qgis_source_id.encode())}"


def review_layer(identifier: str, name: str, collection: FeatureCollection) -> SetupLayer:
    if not declared_crs_is_wgs84(collection) or len(collection.features) > MAX_FEATURES_PER_LAYER:
        message = f"{name}: use WGS84 GeoJSON with at most 20,000 features."
        raise ValidationFailedError(message)
    for feature in collection.features:
        coordinates = positions(feature.geometry)
        if (
            not coordinates
            or max(p[0] for p in coordinates) - min(p[0] for p in coordinates) > MAX_LONGITUDE_SPAN
        ):
            message = f"{name}: empty shapes and dateline-crossing maps are not supported."
            raise ValidationFailedError(message)
    counts: dict[str, int] = {}
    features: list[SetupFeature] = []
    for feature in collection.features:
        key = digest(orjson.dumps(feature.model_dump(mode="json"), option=orjson.OPT_SORT_KEYS))
        occurrence = counts.get(key, 0)
        counts[key] = occurrence + 1
        features.append(SetupFeature(feature_key=f"{key}:{occurrence}", feature=feature))
    return SetupLayer(source_id=identifier, name=name, features=tuple(features))


def normalized_sources(files: list[ProjectFile]) -> list[ProjectFile]:
    if (
        not files
        or len(files) > MAX_FILES
        or sum(len(file.content) for file in files) > 16 * 1024 * 1024
    ):
        message = "Choose at most 64 files totalling 16 MB."
        raise ValidationFailedError(message)
    names: set[str] = set()
    normalized: list[ProjectFile] = []
    for file in files:
        try:
            name = safe_path(file.file_name)
        except ProjectFileError as error:
            raise ValidationFailedError(str(error)) from error
        if name == "." or name.casefold() in names:
            message = "Choose distinct source file paths; this selection contains duplicate names."
            raise ValidationFailedError(message)
        names.add(name.casefold())
        normalized.append(file.model_copy(update={"file_name": name}))
    return normalized


def checked_result(result: ImportData) -> ImportData:
    if sum(len(layer.features) for layer in result.layers) > MAX_SETUP_FEATURES:
        message = (
            "Choose a map with at most 20,000 features in total across all layers. "
            "Reduce the features in QGIS and try again."
        )
        raise ValidationFailedError(message)
    identities = [layer.source_id for layer in result.layers] + [
        issue.source_id for issue in result.issues
    ]
    if len(identities) != len(set(identities)):
        message = "The project contains duplicate layer identifiers. Save a new copy in QGIS."
        raise ValidationFailedError(message)
    if result.project_file and len(result.project_file.content) > MAX_PROJECT_BYTES:
        message = "The QGIS project exceeds 8 MB. Save a smaller project before drawing boundaries."
        raise ValidationFailedError(message)
    if len(result.model_dump_json().encode()) > MAX_CONVERTED_BYTES:
        message = "The converted map exceeds 16 MB. Simplify the layers in QGIS and try again."
        raise ValidationFailedError(message)
    coordinates = [
        position
        for layer in result.layers
        for item in layer.features
        for position in positions(item.feature.geometry)
    ]
    if (
        coordinates
        and max(p[0] for p in coordinates) - min(p[0] for p in coordinates) > MAX_LONGITUDE_SPAN
    ):
        message = (
            "This map spans the dateline or more than 180 degrees. Export a smaller site area."
        )
        raise ValidationFailedError(message)
    return result


async def convert(files: list[ProjectFile], mode: Literal["project", "geojson"]) -> ImportData:
    files = normalized_sources(files)
    match mode:
        case "geojson":
            layers: list[SetupLayer] = []
            for file in files:
                try:
                    collection = FeatureCollection.model_validate_json(file.content)
                except ValidationError as error:
                    message = f"{file.file_name}: this file is not valid WGS84 GeoJSON."
                    raise ValidationFailedError(message) from error
                layers.append(
                    review_layer(digest(file.file_name.encode()), file.file_name, collection)
                )
            return checked_result(ImportData(layers=layers, issues=[], project_file=None))
        case "project":
            result = await import_project(ProjectImportRequest(files=files))
            root = qgis_project.parse(qgis_project.read_document(result.project_file.content))
            identifiers = sorted(
                (
                    item.findtext("id") or "",
                    item.findtext("datasource") or "",
                    item.findtext("layername") or "",
                    item.findtext("provider") or "",
                )
                for item in qgis_project.map_layers(root)
            )
            fingerprint = digest(
                orjson.dumps(
                    {
                        "project": result.project_file.file_name,
                        "title": qgis_project.title(root),
                        "attributes": sorted(root.attrib.items()),
                        "layers": identifiers,
                    }
                )
            )
            return checked_result(
                ImportData(
                    layers=[
                        review_layer(
                            scoped_source_id(fingerprint, layer.source_id),
                            layer.name,
                            layer.collection,
                        )
                        for layer in result.layers
                    ],
                    issues=[
                        SetupIssue.model_validate(
                            {
                                **issue.model_dump(),
                                "source_id": scoped_source_id(fingerprint, issue.source_id),
                            }
                        )
                        for issue in result.issues
                    ],
                    project_file=result.project_file,
                )
            )
    assert_never(mode)
