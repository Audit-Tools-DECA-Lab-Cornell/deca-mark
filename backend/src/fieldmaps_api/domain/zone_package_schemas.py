from dataclasses import dataclass
from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, JsonValue

from fieldmaps_api.domain.packages import (
    Extent,
    LayerName,
    LayerRecord,
    Manifest,
    PreparationCheck,
    SourceProject,
    Zone,
)
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


class LegacyZone(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    zone_code: str
    zone_label: str
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
    manifest: Manifest
    layers: tuple[ArchiveLayer, ...]
    ground: GroundGeometry
    legacy_zones: tuple[LegacyZone, ...]
    checks: tuple[PreparationCheck, ...]


@dataclass(frozen=True, slots=True)
class PackageIdentity:
    site_id: UUID
    package_id: UUID
    package_version: int
    site_code: str


class ManifestZoneV2(Zone):
    zone_id: UUID
    zone_code: str
    display_anchor: Position
    geometry_sha256: str


class ManifestV2(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    format: Literal[2] = 2
    site_code: str
    form_version: str
    extent: Extent
    centre: tuple[float, float]
    layers: tuple[LayerRecord, ...]
    source_project: SourceProject | None
    zone_contract_version: Literal[1] = 1
    site_id: UUID
    package_id: UUID
    package_version: int
    forms: PackageForms
    zones: tuple[ManifestZoneV2, ...]


class ZoneLayerProperties(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    id: str
    zone_id: UUID
    zone_code: str
    name: str
    display_anchor: Position
    geometry_sha256: str


class ZoneLayerFeature(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    type: Literal["Feature"] = "Feature"
    geometry: GroundMultiPolygon
    properties: ZoneLayerProperties


class ZoneLayer(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: tuple[ZoneLayerFeature, ...]


@dataclass(frozen=True, slots=True)
class PreparedZonePackage:
    manifest: ManifestV2
    zone_layer: ZoneLayer
    zone_layer_bytes: bytes
    checks: tuple[PreparationCheck, ...]
    archive: bytes
    archive_sha256: str
