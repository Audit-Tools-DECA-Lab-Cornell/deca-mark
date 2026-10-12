from typing import Final

import pytest
from pydantic import TypeAdapter, ValidationError

from fieldmaps_api.zone_observation_schemas import BoundObservationUpload
from tests.zone_case_models import AuthoredReceipt, AuthoredUpload, EnvelopeCase, upload_cases

SUITE: Final = upload_cases()
VALID_POINT: Final = next(
    case.payload for case in SUITE.envelopes if case.valid and "coordinates" in case.payload
)


@pytest.mark.parametrize("case", SUITE.envelopes, ids=[case.id for case in SUITE.envelopes])
def test_authored_envelope_has_declared_contract_validity(case: EnvelopeCase) -> None:
    schema = TypeAdapter[AuthoredUpload](AuthoredUpload)
    if case.valid:
        assert schema.validate_python(case.payload).model_dump(mode="json")
    else:
        with pytest.raises(ValidationError):
            schema.validate_python(case.payload)


@pytest.mark.parametrize("timestamp", [0, "2026-10-10T14:00:00.1234567Z", "2026-10-10T14:00:00"])
def test_authored_capture_time_requires_timezone_and_microsecond_precision(
    timestamp: int | str,
) -> None:
    payload = dict(VALID_POINT, observed_at=timestamp)
    with pytest.raises(ValidationError):
        TypeAdapter[AuthoredUpload](AuthoredUpload).validate_python(payload)


@pytest.mark.parametrize("number", [float("nan"), float("inf"), float("-inf")])
def test_authored_answer_requires_finite_number(number: float) -> None:
    payload = dict(VALID_POINT, answers={"people": number})
    with pytest.raises(ValidationError):
        TypeAdapter[AuthoredUpload](AuthoredUpload).validate_python(payload)


@pytest.mark.parametrize("count", [200, 201])
def test_authored_answer_count_has_inclusive_limit(count: int) -> None:
    payload = dict(VALID_POINT, answers={f"Q{index}": 1 for index in range(count)})
    schema = TypeAdapter[AuthoredUpload](AuthoredUpload)
    if count == 200:
        assert len(schema.validate_python(payload).answers) == count
    else:
        with pytest.raises(ValidationError):
            schema.validate_python(payload)


@pytest.mark.parametrize("field", ["schema_version", "zone_code", "assignment_basis"])
def test_authored_upload_refuses_protocol_and_server_derived_fields(field: str) -> None:
    payload = dict(VALID_POINT)
    payload[field] = 2 if field == "schema_version" else "recorded_package"
    with pytest.raises(ValidationError):
        TypeAdapter[AuthoredUpload](AuthoredUpload).validate_python(payload)


def test_authored_receipt_requires_recorded_binding_without_protocol_fields() -> None:
    receipt = {
        "observation_id": "40000000-0000-4000-8000-000000000001",
        "project_id": "50000000-0000-4000-8000-000000000001",
        "user_id": "60000000-0000-4000-8000-000000000001",
        "accepted_revision": 1,
        "received_at": "2026-10-10T15:00:00Z",
        "package_id": VALID_POINT["package_id"],
        "zone_id": VALID_POINT["zone_id"],
    }
    assert AuthoredReceipt.model_validate(receipt).accepted_revision == 1
    for field in ("package_id", "zone_id"):
        missing = dict(receipt)
        del missing[field]
        with pytest.raises(ValidationError):
            AuthoredReceipt.model_validate(missing)
    with pytest.raises(ValidationError):
        AuthoredReceipt.model_validate(dict(receipt, schema_version=2))


def test_production_model_accepts_authored_envelopes_without_translation() -> None:
    schema = TypeAdapter[BoundObservationUpload](BoundObservationUpload)
    for case in SUITE.envelopes:
        if case.valid:
            assert schema.validate_python(case.payload)
        else:
            with pytest.raises(ValidationError):
                schema.validate_python(case.payload)
