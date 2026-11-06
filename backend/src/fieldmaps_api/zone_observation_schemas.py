from datetime import UTC, datetime
from typing import Annotated, ClassVar, Final, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StrictBool,
    StrictStr,
    StringConstraints,
    TypeAdapter,
    field_validator,
)

from fieldmaps_api.schemas import Code
from fieldmaps_api.zone_geometry_schemas import Position

MAX_EXACT_INTEGER: Final = 9_007_199_254_740_991
type CaptureTimeText = Annotated[
    str,
    StringConstraints(
        strict=True,
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$",
    ),
]
CAPTURE_TIME_TEXT: Final = TypeAdapter[CaptureTimeText](CaptureTimeText)

type AnswerValue = (
    StrictStr
    | Annotated[int, Field(strict=True)]
    | Annotated[
        float,
        Field(strict=True, allow_inf_nan=False),
    ]
    | tuple[StrictStr, ...]
)


class BoundObservationBase(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    site_id: UUID
    package_id: UUID
    zone_id: UUID
    form_version: Code
    observer: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=12)]
    observed_at: AwareDatetime
    started_at: AwareDatetime | None = None
    answers: Annotated[dict[str, AnswerValue], Field(max_length=200)]

    @field_validator("answers")
    @classmethod
    def canonical_json_numbers(cls, values: dict[str, AnswerValue]) -> dict[str, AnswerValue]:
        # ECMAScript/JCS has finite IEEE754 numbers; normalize only newly allowed unsafe ints.
        normalized: dict[str, AnswerValue] = {}
        for key, value in values.items():
            if isinstance(value, int) and abs(value) > MAX_EXACT_INTEGER:
                try:
                    numeric = float(value)
                    normalized[key] = numeric
                    continue
                except OverflowError as error:
                    message = "Number answer must be finite"
                    raise ValueError(message) from error
            normalized[key] = value
        return normalized

    @field_validator("observed_at", "started_at", mode="before")
    @classmethod
    def capture_time_format(cls, value: JsonValue) -> str | None:
        return None if value is None else CAPTURE_TIME_TEXT.validate_python(value)

    @field_validator("observed_at", "started_at")
    @classmethod
    def utc_capture_time(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        try:
            return value.astimezone(UTC)
        except OverflowError as error:
            message = "Capture time is outside the supported UTC range"
            raise ValueError(message) from error


class BoundPointUpload(BoundObservationBase):
    round_type: Literal["standard", "reliability"]
    placement: Literal["hand"]
    first_round: StrictBool
    coordinates: Position


class BoundInventoryUpload(BoundObservationBase):
    round_type: Literal["inventory"]
    placement: Literal["zone"]


type BoundObservationUpload = Annotated[
    BoundPointUpload | BoundInventoryUpload, Field(discriminator="round_type")
]


class BoundUploadReceipt(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    accepted_revision: Literal[1]
    received_at: AwareDatetime
    package_id: UUID
    zone_id: UUID
