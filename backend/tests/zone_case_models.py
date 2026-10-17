from pathlib import Path
from typing import ClassVar, Final, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue

from fieldmaps_api.zone_observation_schemas import BoundObservationUpload

ROOT: Final = Path(__file__).resolve().parents[2] / "contracts/zones"


class AuthoredModel(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")


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


class FingerprintDocument(AuthoredModel):
    canonicalization_version: Literal["observation-jcs-1"]
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    payload: BoundObservationUpload


def upload_cases() -> UploadCases:
    return UploadCases.model_validate_json((ROOT / "upload.cases.json").read_text())
