from pathlib import Path
from typing import ClassVar, Literal
from uuid import UUID, uuid4

import pytest
from pydantic import BaseModel, ConfigDict, TypeAdapter

from fieldmaps_api.domain.zone_upload_fingerprint import canonical_bytes, fingerprint
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload


class CanonicalDocument(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    payload: BoundObservationUpload


class FingerprintCase(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    id: str
    document: CanonicalDocument
    canonical: str
    sha256: str


class FingerprintSuite(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    fingerprints: tuple[FingerprintCase, ...]


CASES = FingerprintSuite.model_validate_json(
    (Path(__file__).resolve().parents[2] / "contracts/zones/upload.cases.json").read_text()
).fingerprints


@pytest.mark.parametrize("case", CASES, ids=[case.id for case in CASES])
def test_frozen_canonical_bytes_and_hash(case: FingerprintCase) -> None:
    document = case.document
    arguments = (
        document.project_id,
        document.observation_id,
        document.user_id,
        document.payload,
    )
    assert canonical_bytes(*arguments) == case.canonical.encode()
    assert fingerprint(*arguments) == case.sha256


def test_equivalent_wire_representations_have_one_fingerprint() -> None:
    document = CASES[0].document
    body = document.payload.model_dump(mode="json")
    body.update(
        observer="  AB  ",
        observed_at="2026-10-10T10:00:00-04:00",
        site_id=str(document.payload.site_id).upper(),
        answers={"people": 3.0, "notes": "Synthetic"},
    )
    payload = TypeAdapter[BoundObservationUpload](BoundObservationUpload).validate_python(body)
    assert fingerprint(document.project_id, document.observation_id, document.user_id, payload) == (
        CASES[0].sha256
    )


def test_all_request_identities_affect_fingerprint() -> None:
    document = CASES[0].document
    assert fingerprint(uuid4(), document.observation_id, document.user_id, document.payload) != (
        CASES[0].sha256
    )
    assert fingerprint(document.project_id, uuid4(), document.user_id, document.payload) != (
        CASES[0].sha256
    )
    assert fingerprint(document.project_id, document.observation_id, uuid4(), document.payload) != (
        CASES[0].sha256
    )


@pytest.mark.parametrize("change", ["binding", "answer", "array_order", "unicode"])
def test_capture_content_changes_fingerprint(
    change: Literal["binding", "answer", "array_order", "unicode"],
) -> None:
    document = CASES[0].document
    original = document.payload.model_dump(mode="json")
    original["answers"] = {"people": 3, "notes": "café", "activities": ["walk", "sit"]}
    changed = dict(original)
    match change:
        case "binding":
            changed["package_id"] = str(uuid4())
        case "answer":
            changed["answers"] = {"people": 4, "notes": "café", "activities": ["walk", "sit"]}
        case "array_order":
            changed["answers"] = {"people": 3, "notes": "café", "activities": ["sit", "walk"]}
        case "unicode":
            changed["answers"] = {"people": 3, "notes": "cafe\u0301", "activities": ["walk", "sit"]}
    adapter = TypeAdapter[BoundObservationUpload](BoundObservationUpload)
    assert fingerprint(
        document.project_id,
        document.observation_id,
        document.user_id,
        adapter.validate_python(original),
    ) != fingerprint(
        document.project_id,
        document.observation_id,
        document.user_id,
        adapter.validate_python(changed),
    )
