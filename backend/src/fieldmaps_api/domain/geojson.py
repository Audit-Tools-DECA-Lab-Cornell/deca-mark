"""The slice of GeoJSON a site package may carry, as validating models.

RFC 7946 fixes the coordinate reference system: longitude and latitude in WGS 84, longitude
first. That is also what `fieldmaps.observations` stores and what QGIS must be told to export,
so validating it here is the coordinate-reference check rather than a formality — a layer saved
in a projected CRS arrives with coordinates in metres and fails on range before it can be
packaged and shipped to a device that would draw it in the ocean.

Only the geometry types a site plan needs are accepted. QGIS writes the `Multi` variants
whenever a layer holds one, so refusing them would fail a correct export.
"""

from typing import Annotated, ClassVar, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

MAX_LONGITUDE = 180.0
MAX_LATITUDE = 90.0
POSITION_LENGTH = (2, 3)
#: The phrase of the range messages below, which `zone_archive` reads to tell a layer exported in a
#: projected CRS from a layer with a malformed shape.
OUTSIDE_WGS84 = "is outside WGS 84"


def _wgs84_position(value: list[float]) -> list[float]:
    if len(value) not in POSITION_LENGTH:
        message = "A position needs longitude and latitude, and may carry an elevation"
        raise ValueError(message)
    longitude, latitude = value[0], value[1]
    if not -MAX_LONGITUDE <= longitude <= MAX_LONGITUDE:
        message = f"Longitude {longitude} {OUTSIDE_WGS84}; export with CRS EPSG:4326"
        raise ValueError(message)
    if not -MAX_LATITUDE <= latitude <= MAX_LATITUDE:
        message = f"Latitude {latitude} {OUTSIDE_WGS84}; export with CRS EPSG:4326"
        raise ValueError(message)
    # Elevation is dropped: the collector draws a plan, and a third ordinal would travel to
    # devices unread and unstored.
    return [longitude, latitude]


Position = Annotated[list[float], AfterValidator(_wgs84_position)]


class _Geometry(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")


class PointGeometry(_Geometry):
    type: Literal["Point"]
    coordinates: Position


class MultiPointGeometry(_Geometry):
    type: Literal["MultiPoint"]
    coordinates: list[Position]


class LineStringGeometry(_Geometry):
    type: Literal["LineString"]
    coordinates: list[Position]


class MultiLineStringGeometry(_Geometry):
    type: Literal["MultiLineString"]
    coordinates: list[list[Position]]


class PolygonGeometry(_Geometry):
    type: Literal["Polygon"]
    coordinates: list[list[Position]]


class MultiPolygonGeometry(_Geometry):
    type: Literal["MultiPolygon"]
    coordinates: list[list[list[Position]]]


Geometry = Annotated[
    PointGeometry
    | MultiPointGeometry
    | LineStringGeometry
    | MultiLineStringGeometry
    | PolygonGeometry
    | MultiPolygonGeometry,
    Field(discriminator="type"),
]

PropertyValue = str | float | int | bool | None


class Feature(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")

    type: Literal["Feature"]
    geometry: Geometry
    properties: dict[str, PropertyValue] = Field(default_factory=dict[str, PropertyValue])

    def text(self, key: str) -> str | None:
        value = self.properties.get(key)
        return value.strip() or None if isinstance(value, str) else None


class NamedCrs(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")

    properties: dict[str, PropertyValue] = Field(default_factory=dict[str, PropertyValue])

    def name(self) -> str | None:
        value = self.properties.get("name")
        return value if isinstance(value, str) else None


class FeatureCollection(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")

    type: Literal["FeatureCollection"]
    features: list[Feature]
    # RFC 7946 removed the member, but QGIS still writes it when RFC7946 is left off. It is read
    # only to reject a collection that announces a CRS this format cannot carry.
    crs: NamedCrs | None = None


# The names RFC 7946 and its predecessor use for the one CRS this format allows.
WGS84_NAMES = frozenset(
    {
        "urn:ogc:def:crs:ogc:1.3:crs84",
        "urn:ogc:def:crs:ogc::crs84",
        "urn:ogc:def:crs:epsg::4326",
        "epsg:4326",
        "crs84",
        "wgs 84",
        "wgs84",
    }
)


def declared_crs_is_wgs84(collection: FeatureCollection) -> bool:
    """Whether a declared CRS member, if present, names WGS 84 longitude/latitude."""
    if collection.crs is None:
        return True
    name = collection.crs.name()
    return name is None or name.strip().lower() in WGS84_NAMES


def positions(geometry: Geometry) -> list[list[float]]:
    """Every position in a geometry, flattened, for extent work."""
    if isinstance(geometry, PointGeometry):
        return [geometry.coordinates]
    if isinstance(geometry, MultiPointGeometry | LineStringGeometry):
        return list(geometry.coordinates)
    if isinstance(geometry, MultiLineStringGeometry | PolygonGeometry):
        return [position for part in geometry.coordinates for position in part]
    return [position for part in geometry.coordinates for ring in part for position in ring]
