from hashlib import sha256
from pathlib import Path
from typing import ClassVar, Literal

import pytest
from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.schemas import ObservationUpload
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload, BoundUploadReceipt

CONTRACT = Path(__file__).resolve().parents[2] / "contracts/zones/upload.cases.json"


class EnvelopeCase(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    id: str
    protocol: Literal[1, 2]
    payload: dict[str, JsonValue]
    valid: bool
    canonical: str | None = None
    sha256: str | None = None


class UploadCases(BaseModel):
    contract_version: Literal[1]
    synthetic: Literal[True]
    envelopes: tuple[EnvelopeCase, ...]
    scenarios: tuple[dict[str, JsonValue], ...]


def test_upload_cases_are_available_when_contract_is_frozen() -> None:
    # Given the shared artifact path, when implementation owners open it, then it exists.
    assert CONTRACT.is_file()


SUITE = UploadCases.model_validate_json(CONTRACT.read_text())


@pytest.mark.parametrize(
    "case",
    [case for case in SUITE.envelopes if case.protocol == 1],
    ids=[case.id for case in SUITE.envelopes if case.protocol == 1],
)
def test_legacy_fingerprint_when_authored_case_is_parsed(case: EnvelopeCase) -> None:
    # Given a v1 request, when serialized by the shipped schema, then its golden hash is unchanged.
    parsed = ObservationUpload.model_validate(case.payload)
    canonical = parsed.model_dump_json(exclude_unset=True)
    assert canonical == case.canonical
    assert sha256(canonical.encode()).hexdigest() == case.sha256


@pytest.mark.parametrize(
    "case",
    [case for case in SUITE.envelopes if case.protocol == 2],
    ids=[case.id for case in SUITE.envelopes if case.protocol == 2],
)
def test_bound_envelope_when_authored_case_is_parsed(case: EnvelopeCase) -> None:
    # Given an authored v2 envelope, when parsed, then validity matches its independent expectation.
    schema = TypeAdapter[BoundObservationUpload](BoundObservationUpload)
    if case.valid:
        assert schema.validate_python(case.payload).schema_version == 2
    else:
        with pytest.raises(ValidationError):
            schema.validate_python(case.payload)


def test_v2_receipt_when_binding_is_missing() -> None:
    # Given a valid legacy receipt, when parsed as bound, then missing binding is rejected.
    receipt = {
        "observation_id": "40000000-0000-4000-8000-000000000001",
        "project_id": "50000000-0000-4000-8000-000000000001",
        "user_id": "60000000-0000-4000-8000-000000000001",
        "accepted_revision": 1,
        "received_at": "2026-10-10T15:00:00Z",
    }
    with pytest.raises(ValidationError):
        BoundUploadReceipt.model_validate(receipt)


@pytest.mark.parametrize("timestamp", [0, "2026-10-10T14:00:00.1234567Z", "2026-10-10T14:00:00"])
def test_capture_time_when_not_in_frozen_timestamp_format(timestamp: int | str) -> None:
    # Given unsupported capture notation, when parsed, then no time is guessed or truncated.
    payload = dict(SUITE.envelopes[1].payload, observed_at=timestamp)
    with pytest.raises(ValidationError):
        TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_python(payload)


@pytest.mark.parametrize("number", [float("nan"), float("inf"), float("-inf")])
def test_nonfinite_answer_when_bound_payload_is_parsed(number: float) -> None:
    # Given a non-finite research answer, when parsed, then it cannot enter a frozen upload body.
    payload = dict(SUITE.envelopes[1].payload, answers={"people": number})
    with pytest.raises(ValidationError):
        TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_python(payload)


@pytest.mark.parametrize("count", [200, 201])
def test_answer_count_when_bound_payload_is_parsed(count: int) -> None:
    # Given the inclusive answer limit, when parsed, then one extra field is rejected.
    payload = dict(SUITE.envelopes[1].payload, answers={f"Q{index}": 1 for index in range(count)})
    schema = TypeAdapter[BoundObservationUpload](BoundObservationUpload)
    if count == 200:
        assert len(schema.validate_python(payload).answers) == count
    else:
        with pytest.raises(ValidationError):
            schema.validate_python(payload)
