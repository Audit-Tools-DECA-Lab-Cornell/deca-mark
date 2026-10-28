from datetime import UTC, datetime
from typing import Final

import pytest
from pydantic import TypeAdapter, ValidationError

from fieldmaps_api.domain.zone_upload_fingerprint import canonical_bytes, fingerprint
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload
from tests.zone_case_models import FingerprintDocument, upload_cases

CASE: Final = upload_cases().fingerprints[0]


def test_started_at_is_normalized_and_affects_upload_identity() -> None:
    # Given an older valid payload and a start in a different timezone.
    original = FingerprintDocument.model_validate(CASE.document)
    body = original.payload.model_dump(mode="json") | {"started_at": "2026-10-10T09:59:00-04:00"}
    # When the new upload is parsed and fingerprinted.
    payload = TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_python(body)
    # Then the start is UTC, participates in identity, and uses microsecond canonical precision.
    assert payload.started_at == datetime(2026, 10, 10, 13, 59, tzinfo=UTC)
    arguments = (original.project_id, original.observation_id, original.user_id, payload)
    assert b'"started_at":"2026-10-10T13:59:00.000000Z"' in canonical_bytes(*arguments)
    assert fingerprint(*arguments) != CASE.sha256


@pytest.mark.parametrize("timestamp", [0, "2026-10-10T14:00:00", "2026-10-10T14:00:00.1234567Z"])
def test_started_at_requires_a_timezone_and_supported_precision(timestamp: int | str) -> None:
    # Given an invalid external capture timestamp.
    original = FingerprintDocument.model_validate(CASE.document)
    # When it crosses the upload boundary, it is rejected.
    with pytest.raises(ValidationError):
        TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_python(
            original.payload.model_dump(mode="json") | {"started_at": timestamp}
        )


def test_omitted_start_keeps_existing_golden_fingerprint() -> None:
    # Given an unchanged upload from an older collector.
    original = FingerprintDocument.model_validate(CASE.document)
    # When the new server fingerprints it.
    result = canonical_bytes(
        original.project_id, original.observation_id, original.user_id, original.payload
    )
    # Then its canonical bytes and start absence are preserved exactly.
    assert result == CASE.canonical.encode()
    assert original.payload.started_at is None
    replay = TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_json(
        original.payload.model_dump_json()
    )
    assert (
        canonical_bytes(original.project_id, original.observation_id, original.user_id, replay)
        == result
    )


@pytest.mark.parametrize("started_at", [None, "2026-10-11T14:00:00Z"])
def test_unknown_start_and_clock_changes_do_not_require_time_ordering(
    started_at: str | None,
) -> None:
    original = FingerprintDocument.model_validate(CASE.document)
    payload = TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_python(
        original.payload.model_dump(mode="json") | {"started_at": started_at}
    )
    assert payload.started_at == (
        None if started_at is None else datetime.fromisoformat(started_at)
    )
