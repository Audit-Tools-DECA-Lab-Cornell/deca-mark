from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, ClassVar, Final, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    StrictBool,
    StrictFloat,
    StrictInt,
    StrictStr,
    StringConstraints,
    TypeAdapter,
    field_validator,
)

ROOT: Final = Path(__file__).resolve().parents[2] / "contracts/zones"
MAX_EXACT_INTEGER: Final = 9_007_199_254_740_991
type Answer = (
    StrictStr
    | Annotated[StrictInt, Field(ge=-MAX_EXACT_INTEGER, le=MAX_EXACT_INTEGER)]
    | Annotated[
        StrictFloat, Field(allow_inf_nan=False, ge=-MAX_EXACT_INTEGER, le=MAX_EXACT_INTEGER)
    ]
    | tuple[StrictStr, ...]
)
type CaptureTime = Annotated[
    str,
    StringConstraints(
        strict=True,
        pattern=r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$",
    ),
]
type Position = tuple[
    Annotated[StrictFloat, Field(ge=-180, le=180, allow_inf_nan=False)],
    Annotated[StrictFloat, Field(ge=-90, le=90, allow_inf_nan=False)],
]


class AuthoredModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")


class AuthoredObservation(AuthoredModel):
    site_id: UUID
    package_id: UUID
    zone_id: UUID
    form_version: Annotated[
        str,
        StringConstraints(
            strict=True, min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][\w.-]*$"
        ),
    ]
    observer: Annotated[
        str, StringConstraints(strict=True, strip_whitespace=True, min_length=1, max_length=12)
    ]
    observed_at: AwareDatetime
    answers: Annotated[dict[str, Answer], Field(max_length=200)]

    @field_validator("observed_at", mode="before")
    @classmethod
    def capture_time_text(cls, value: JsonValue) -> str:
        return TypeAdapter[CaptureTime](CaptureTime).validate_python(value)

    @field_validator("observed_at")
    @classmethod
    def utc_capture_time(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)


class AuthoredPoint(AuthoredObservation):
    round_type: Literal["standard", "reliability"]
    placement: Literal["hand"]
    first_round: StrictBool
    coordinates: Position


class AuthoredInventory(AuthoredObservation):
    round_type: Literal["inventory"]
    placement: Literal["zone"]


type AuthoredUpload = Annotated[
    AuthoredPoint | AuthoredInventory, Field(discriminator="round_type")
]


class EnvelopeCase(AuthoredModel):
    id: str
    payload: dict[str, JsonValue]
    valid: bool


class FingerprintCase(AuthoredModel):
    id: str
    document: dict[str, JsonValue]
    canonical: str
    sha256: str


class UploadCases(AuthoredModel):
    synthetic: Literal[True]
    envelopes: tuple[EnvelopeCase, ...]
    scenarios: tuple[dict[str, JsonValue], ...]
    fingerprints: tuple[FingerprintCase, ...]


class AuthoredReceipt(AuthoredModel):
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    accepted_revision: Literal[1]
    received_at: AwareDatetime
    package_id: UUID
    zone_id: UUID


class AuthoredFingerprintDocument(AuthoredModel):
    canonicalization_version: Literal["observation-jcs-1"]
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    payload: AuthoredUpload


def upload_cases() -> UploadCases:
    return UploadCases.model_validate_json((ROOT / "upload.cases.json").read_text())
