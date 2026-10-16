from typing import Annotated

from pydantic import BeforeValidator, Field, JsonValue, PlainSerializer, WithJsonSchema


def split_bbox(value: JsonValue | tuple[float, ...]) -> JsonValue | tuple[float, ...] | list[str]:
    match value:
        case str() as raw:
            return raw.split(",")
        case [str() as raw]:
            return raw.split(",")
        case _:
            return value


type Longitude = Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)]
type Latitude = Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)]


def serialize_bbox(bounds: tuple[float, float, float, float]) -> str:
    return ",".join(str(value) for value in bounds)


type BoundingBox = Annotated[
    tuple[Longitude, Latitude, Longitude, Latitude],
    BeforeValidator(split_bbox),
    PlainSerializer(serialize_bbox, return_type=str),
    WithJsonSchema({"type": "string", "examples": ["-77,42,-76,43"]}),
]
