from dataclasses import dataclass
from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, JsonValue

from fieldmaps_api.domain.packages import LayerName, PreparationCheck, SourceProject
from fieldmaps_api.zone_geometry_schemas import Position, closed_ring
from fieldmaps_api.zone_response_schemas import PackageForms

type GroundRing = Annotated[tuple[Position, ...], Field(min_length=4), AfterValidator(closed_ring)]
type GroundPolygonCoordinates = Annotated[tuple[GroundRing, ...], Field(min_length=1)]


class GroundPolygon(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    type: Literal["Polygon"]
    coordinates: GroundPolygonCoordinates


class GroundMultiPolygon(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    type: Literal["MultiPolygon"]
    coordinates: Annotated[tuple[GroundPolygonCoordinates, ...], Field(min_length=1)]


type GroundGeometry = Annotated[GroundPolygon | GroundMultiPolygon, Field(discriminator="type")]


class ManifestZone(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    zone_id: UUID
    zone_code: str
    label: str
    bbox: tuple[float, float, float, float]
    display_anchor: Position
    geometry_sha256: Annotated[str, Field(pattern=r"^[a-f0-9]{64}$")]


class PackageZone(ManifestZone):
    geometry: GroundGeometry


class ArchiveFeature(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    type: Literal["Feature"]
    geometry: JsonValue
    properties: dict[str, JsonValue]


class ArchiveCollection(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    type: Literal["FeatureCollection"]
    features: tuple[ArchiveFeature, ...]


@dataclass(frozen=True, slots=True)
class ArchiveLayer:
    name: LayerName
    payload: bytes
    features: int
    positions: tuple[Position, ...]


@dataclass(frozen=True, slots=True)
class BaseArchive:
    layers: tuple[ArchiveLayer, ...]
    ground: GroundGeometry
    zones: tuple[PackageZone, ...]
    site_code: str
    source_project: SourceProject | None
    checks: tuple[PreparationCheck, ...]


@dataclass(frozen=True, slots=True)
class PackageIdentity:
    site_id: UUID
    package_id: UUID
    package_version: int
    site_code: str


class ZonePackageManifest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    format: Literal[1] = 1
    site_id: UUID
    site_code: str
    package_id: UUID
    package_version: Annotated[int, Field(ge=1)]
    forms: PackageForms
    zones: tuple[ManifestZone, ...]


class ZoneLayerProperties(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    zone_id: UUID
    zone_code: str
    name: str
    display_anchor: Position
    geometry_sha256: str


class ZoneLayerFeature(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    type: Literal["Feature"] = "Feature"
    geometry: GroundMultiPolygon
    properties: ZoneLayerProperties


class ZoneLayer(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: tuple[ZoneLayerFeature, ...]


@dataclass(frozen=True, slots=True)
class PreparedZonePackage:
    manifest: ZonePackageManifest
    zone_layer: ZoneLayer
    zone_layer_bytes: bytes
    checks: tuple[PreparationCheck, ...]
    archive: bytes
    archive_sha256: str
