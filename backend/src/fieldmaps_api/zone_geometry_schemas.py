from typing import Annotated, ClassVar, Final, Literal, assert_never

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

MAX_ZONE_POSITIONS: Final = 2_000
MAX_PACKAGE_POSITIONS: Final = 20_000
MAX_PACKAGE_ZONES: Final = 250
MIN_RING_VERTICES: Final = 3

type Position = tuple[
    Annotated[float, Field(strict=True, ge=-180, le=180, allow_inf_nan=False)],
    Annotated[float, Field(strict=True, ge=-90, le=90, allow_inf_nan=False)],
]


def closed_ring(value: tuple[Position, ...]) -> tuple[Position, ...]:
    if value[0] != value[-1] or len(set(value[:-1])) < MIN_RING_VERTICES:
        message = "A closed ring needs at least three distinct vertices"
        raise ValueError(message)
    return value


type Ring = Annotated[
    tuple[Position, ...],
    Field(min_length=4, max_length=MAX_ZONE_POSITIONS),
    AfterValidator(closed_ring),
]
type PolygonCoordinates = Annotated[tuple[Ring, ...], Field(min_length=1)]


class PolygonInput(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    type: Literal["Polygon"]
    coordinates: PolygonCoordinates


class MultiPolygonInput(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    type: Literal["MultiPolygon"]
    coordinates: Annotated[tuple[PolygonCoordinates, ...], Field(min_length=1)]


def bounded_geometry(value: PolygonInput | MultiPolygonInput) -> PolygonInput | MultiPolygonInput:
    if position_count(value) > MAX_ZONE_POSITIONS:
        message = "A zone may carry at most 2,000 positions across all rings and parts"
        raise ValueError(message)
    return value


type ZoneGeometry = Annotated[
    PolygonInput | MultiPolygonInput, Field(discriminator="type"), AfterValidator(bounded_geometry)
]


def position_count(value: PolygonInput | MultiPolygonInput) -> int:
    match value:
        case PolygonInput(coordinates=rings):
            return sum(len(ring) for ring in rings)
        case MultiPolygonInput(coordinates=parts):
            return sum(len(ring) for part in parts for ring in part)
        case _:
            assert_never(value)
