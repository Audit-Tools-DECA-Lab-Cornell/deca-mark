"""Version, transport, provenance and preflight boundaries without database access."""

import json
from hashlib import sha256
from uuid import UUID, uuid4

import pytest
from pydantic import JsonValue, ValidationError

from fieldmaps_api.domain.form_definition import FORM_SCHEMA_VERSION
from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.domain.observation_export_plan import answer_cells, plan
from fieldmaps_api.domain.zone_upload_fingerprint import canonical_bytes
from fieldmaps_api.errors import DomainError
from fieldmaps_api.form_schema_preflight import PreflightRow, preflight
from fieldmaps_api.form_schema_upgrade import psql
from fieldmaps_api.form_schema_version import require_current_schema
from fieldmaps_api.form_schemas import DraftCreate, DraftUpdate, FormCreate
from fieldmaps_api.zone_observation_schemas import BoundPointUpload
from tests.test_observation_analysis_domain import canonical, question, snapshot


@pytest.mark.parametrize("version", [None, True, "2", 1, 3, 0, 2.1])
def test_current_version_refusal_is_typed(version: JsonValue) -> None:
    # Given an unsupported served version, when checked, then the update refusal is stable.
    with pytest.raises(DomainError) as failure:
        require_current_schema(version)
    assert failure.value.code == "unknown_schema_version"


@pytest.mark.parametrize("version", [2, 2.0])
def test_current_json_number_is_accepted(version: JsonValue) -> None:
    # Given JSON's single number type, when checking integer or float2, then both are current.
    assert FORM_SCHEMA_VERSION == 2
    require_current_schema(version)


def test_form_writes_default_current_but_preserve_explicit_invalid_version() -> None:
    # Given omitted and explicitly null versions, when parsing writes, then the service sees both.
    raw = canonical([question("value", "value")])
    assert FormCreate(code="synthetic", name="Synthetic", definition=raw).schema_version == 2
    assert DraftCreate().schema_version == 2
    assert DraftUpdate(definition=raw, schema_version=None).schema_version is None


def test_decimal_transport_can_be_fingerprinted_above_safe_integer_range() -> None:
    # Given a finite decimal JSON value outside the integer domain.
    payload = BoundPointUpload.model_validate(
        {
            "site_id": uuid4(),
            "package_id": uuid4(),
            "zone_id": uuid4(),
            "form_version": "test-v1",
            "observer": "QA",
            "observed_at": "2026-10-24T12:00:00Z",
            "answers": {"value": 10**100},
            "round_type": "standard",
            "first_round": True,
            "placement": "hand",
            "coordinates": [-76, 42],
        }
    )
    # When serializing immutable identity, then JCS accepts the finite IEEE754 representation.
    assert isinstance(payload.answers["value"], float)
    project_id, observation_id, owner_id = uuid4(), uuid4(), uuid4()
    original = canonical_bytes(project_id, observation_id, owner_id, payload)
    assert b"1e+100" in original
    replay = BoundPointUpload.model_validate_json(payload.model_dump_json())
    assert canonical_bytes(project_id, observation_id, owner_id, replay) == original


def test_explicit_column_provenance_keeps_automatic_observer_column() -> None:
    # Given an authored observer answer equal to immutable envelope metadata.
    definition = canonical([question("observer", "observer") | {"valueSource": "observerCode"}])
    definition["columnNaming"] = "questionId"
    source = snapshot({"observer": "QA"}, definition)
    # When exporting schema2, then the authored answer has its own column.
    planned = plan(source.items, source.forms, source.form_schema_versions)
    assert answer_cells(planned, source.items[0]) == {"answer_observer": "QA"}
    # Schema1 ignored that same marker and retains historical omission.
    historical = plan(source.items, source.forms, {"test-v1": 1})
    assert answer_cells(historical, source.items[0]) == {}


def test_preflight_validates_real_schema_and_binds_exact_stored_bytes() -> None:
    # Given a complete schema1 snapshot of a canonical definition.
    text = json.dumps(canonical([question("value", "Old_Column")]))
    row = PreflightRow(id=uuid4(), schema_version=1, definition_text=text)
    # When actual schema2 validation succeeds, then report hashes bind exact stored bytes.
    report = preflight([row])
    assert report.rows[0].definition_sha256 == sha256(text.encode()).hexdigest()
    assert report.rows[0].id == row.id


@pytest.mark.parametrize("property_name", ["columnNaming", "numberMode", "valueSource", "dateTime"])
def test_preflight_refuses_formerly_ignored_semantic_properties(property_name: str) -> None:
    # Given a stored property whose ignored value would acquire semantics in schema2.
    raw = canonical([question("value", "value")])
    raw["unknownObject"] = {property_name: "manual"}
    row = PreflightRow(id=uuid4(), schema_version=1, definition_text=json.dumps(raw))
    # When preflighting, then every such row blocks the all-or-nothing transition.
    with pytest.raises(ValueError, match="formerly ignored"):
        preflight([row])


@pytest.mark.parametrize("raw", [{"fields": "invalid"}, {"questions": []}])
def test_preflight_refuses_invalid_stored_definitions(raw: dict[str, JsonValue]) -> None:
    row = PreflightRow(id=UUID(int=1), schema_version=1, definition_text=json.dumps(raw))
    with pytest.raises(ValidationError):
        preflight([row])


def test_id_provenance_rejects_mismatched_export_columns() -> None:
    # Given an invalid marker, when parsed, then it cannot gain provenance by wording alone.
    raw = canonical([question("value", "Old_Column")]) | {"columnNaming": "questionId"}
    with pytest.raises(ValidationError, match="question-ID"):
        FormDefinition.model_validate(raw)


@pytest.mark.parametrize(
    "target", ["remote-host", "supabase_db_other", "127.0.0.1", "decamark-schema2-x"]
)
def test_local_upgrade_helper_refuses_unknown_targets_before_docker(target: str) -> None:
    # Given an unauthorized target, when requested, then no connection/process can be started.
    with pytest.raises(ValueError, match="Only the known local"):
        psql(target, "SELECT 1;")
