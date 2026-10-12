from copy import deepcopy
from hashlib import sha256
from typing import Final, Literal, assert_never
from uuid import uuid4

import pytest
import rfc8785
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.zone_upload_fingerprint import canonical_bytes, fingerprint
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload
from tests.zone_case_models import AuthoredFingerprintDocument, FingerprintCase, upload_cases

CASES: Final = upload_cases().fingerprints


@pytest.mark.parametrize("case", CASES, ids=[case.id for case in CASES])
def test_authored_canonical_bytes_match_independent_jcs(case: FingerprintCase) -> None:
    document = AuthoredFingerprintDocument.model_validate(case.document)
    assert rfc8785.dumps(case.document) == case.canonical.encode()
    assert sha256(case.canonical.encode()).hexdigest() == case.sha256
    payload = TypeAdapter(dict[str, JsonValue]).validate_python(case.document["payload"])
    assert payload["observed_at"] == document.payload.observed_at.strftime("%Y-%m-%dT%H:%M:%S.%fZ")
    assert payload["observer"] == document.payload.observer
    identities = {
        "observation_id": document.observation_id,
        "project_id": document.project_id,
        "user_id": document.user_id,
    }
    binding = {
        "site_id": document.payload.site_id,
        "package_id": document.payload.package_id,
        "zone_id": document.payload.zone_id,
    }
    for field, value in identities.items():
        assert case.document[field] == str(value)
    for field, value in binding.items():
        assert payload[field] == str(value)


@pytest.mark.parametrize("identity", ["project_id", "observation_id", "user_id"])
def test_authored_request_identities_affect_hash(identity: str) -> None:
    changed = deepcopy(CASES[0].document)
    changed[identity] = str(uuid4())
    assert sha256(rfc8785.dumps(changed)).hexdigest() != CASES[0].sha256


@pytest.mark.parametrize("change", ["binding", "answer", "array_order", "unicode"])
def test_authored_content_changes_affect_hash(
    change: Literal["binding", "answer", "array_order", "unicode"],
) -> None:
    original = deepcopy(CASES[0].document)
    payload = TypeAdapter(dict[str, JsonValue]).validate_python(original["payload"])
    payload["answers"] = {"people": 3, "notes": "café", "activities": ["walk", "sit"]}
    original["payload"] = payload
    changed = deepcopy(original)
    body = TypeAdapter(dict[str, JsonValue]).validate_python(changed["payload"])
    match change:
        case "binding":
            body["package_id"] = str(uuid4())
        case "answer":
            body["answers"] = {"people": 4, "notes": "café", "activities": ["walk", "sit"]}
        case "array_order":
            body["answers"] = {"people": 3, "notes": "café", "activities": ["sit", "walk"]}
        case "unicode":
            body["answers"] = {"people": 3, "notes": "cafe\u0301", "activities": ["walk", "sit"]}
        case _:
            assert_never(change)
    changed["payload"] = body
    assert rfc8785.dumps(original) != rfc8785.dumps(changed)


@pytest.mark.skip(reason="BE-22 must implement observation-jcs-1 on the sole /v1 upload path")
def test_production_fingerprint_matches_authored_golden_bytes_without_translation() -> None:
    for case in CASES:
        document = AuthoredFingerprintDocument.model_validate(case.document)
        payload = TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_python(
            case.document["payload"]
        )
        arguments = (document.project_id, document.observation_id, document.user_id, payload)
        assert canonical_bytes(*arguments) == case.canonical.encode()
        assert fingerprint(*arguments) == case.sha256
