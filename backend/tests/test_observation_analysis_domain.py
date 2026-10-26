import base64
import csv
from datetime import UTC, datetime
from io import StringIO
from uuid import uuid4

import pytest
from pydantic import JsonValue, ValidationError

from fieldmaps_api.domain.observation_export import BYTE_LIMIT, assets, bundle, csv_bytes
from fieldmaps_api.domain.observation_filters import decode_cursor, encode_cursor
from fieldmaps_api.errors import DomainError
from fieldmaps_api.observation_analysis_schemas import (
    ExportSnapshot,
    HistoricalObservation,
    ObservationExportQuery,
    ObservationFilters,
)
from tests.zone_api_fixtures import document


def snapshot(answers: dict[str, JsonValue], definition: dict[str, JsonValue]) -> ExportSnapshot:
    package_id, zone_id = uuid4(), uuid4()
    row = HistoricalObservation.model_validate(
        {
            "observation_id": str(uuid4()),
            "project_id": str(uuid4()),
            "user_id": str(uuid4()),
            "site_id": str(uuid4()),
            "site_code": "synthetic",
            "site_name": "=danger",
            "observer": "QA",
            "observed_at": "2026-11-01T05:30:00Z",
            "received_at": "2026-11-01T06:30:00Z",
            "revision": 1,
            "answers": answers,
            "form_version": "test-v1",
            "round_type": "standard",
            "first_round": True,
            "placement": "hand",
            "package_id": str(package_id),
            "package_version": 1,
            "zone_id": str(zone_id),
            "zone_code": "same",
            "zone_label": "Same label",
            "spatial_support": "point",
            "geometry": {"type": "Point", "coordinates": [-76.0, 42.0]},
            "display_anchor": None,
        }
    )
    return ExportSnapshot.model_validate(
        {
            "items": [row],
            "forms": {"test-v1": definition},
            "form_schema_versions": {"test-v1": 2},
            "historical_zones": {
                f"{package_id}:{zone_id}": {
                    "type": "MultiPolygon",
                    "coordinates": [
                        [
                            [
                                [-76.1, 41.9],
                                [-75.9, 41.9],
                                [-75.9, 42.1],
                                [-76.1, 41.9],
                            ]
                        ]
                    ],
                }
            },
            "total_matching": 1,
            "source_bytes": 100,
            "timezone": "America/New_York",
            "generated_at": datetime.now(UTC),
        }
    )


def canonical(questions: list[JsonValue]) -> dict[str, JsonValue]:
    return {
        "version": "test-v1",
        "title": "Synthetic",
        "summary": "Synthetic",
        "source": "test",
        "status": "published",
        "inclusion": "Synthetic",
        "questions": questions,
    }


def question(question_id: str, column: str, kind: str = "text") -> dict[str, JsonValue]:
    return {
        "id": question_id,
        "code": question_id,
        "exportColumn": column,
        "act": "Record",
        "label": "=label",
        "kind": kind,
        "source": "synthetic",
    }


def test_export_cells_when_null_missing_multi_and_headers_collide() -> None:
    # Given a canonical historical definition with dangerous/colliding and unknown answers.
    multi = question("c", "multi", "many")
    multi["options"] = [{"code": "x", "label": "X"}, {"code": "y", "label": "Y"}]
    data = snapshot(
        {"a": "\t=bad", "b": None, "c": ["x", "y"], "unknown": "@bad"},
        canonical(
            [
                question("a", "=A"),
                question("b", "'=A"),
                multi,
                question("absent", "zone_id"),
            ]
        ),
    )
    # When its CSV and codebook are serialized.
    output = assets(data, ObservationExportQuery(), "project")
    rows = list(csv.DictReader(StringIO(output["observations.csv"].decode("utf-8-sig"))))
    codebook = list(csv.DictReader(StringIO(output["codebook.csv"].decode("utf-8-sig"))))
    # Then formula protection, unique headers and the missing/null distinction hold.
    assert rows[0]["'=A"] == "'\t=bad"
    assert rows[0]["'=A_b"] == "n/a"
    assert rows[0]["answer_zone_id"] == ""
    assert rows[0]["unknown"] == "'@bad"
    assert rows[0]["multi"] == "x;y"
    assert rows[0]["site_name"] == "'=danger"
    assert rows[0]["longitude"] == "-76.0"
    assert len(rows[0]) == len({entry["export_column"] for entry in codebook})


def test_dynamic_columns_when_controller_selects_option_set() -> None:
    # Given historical dynamic option sets with their own export columns.
    dynamic = question("child", "fallback", "one")
    dynamic["dynamicFrom"] = {
        "question": "parent",
        "sets": {
            "p": {
                "code": "p",
                "exportColumn": "named",
                "label": "Play label",
                "options": [{"code": "x", "label": "X"}],
            },
        },
    }
    parent = question("parent", "parent", "one")
    parent["options"] = [{"code": "p", "label": "P"}]
    data = snapshot({"parent": "p", "child": "x"}, canonical([parent, dynamic]))
    # When that historical row is exported.
    output = assets(data, ObservationExportQuery(), "project")
    row = next(csv.DictReader(StringIO(output["observations.csv"].decode("utf-8-sig"))))
    # Then the answer uses its selected named set column.
    assert row["named"] == "x"
    assert "fallback" not in row


@pytest.mark.parametrize("value", ["=a", "+a", "-a", "@a", "  =a", "\t=a", "\r=a", "\n=a"])
def test_csv_protection_when_text_begins_formula_prefix(value: str) -> None:
    # Given an untrusted header, label or answer cell.
    # When it is serialized by the common CSV boundary.
    output = next(csv.reader(StringIO(csv_bytes([[value]]).decode("utf-8-sig"))))
    # Then spreadsheet formula parsing is neutralized.
    assert output == ["'" + value]


def test_cursor_normalization_when_equivalent_utc_bounds_change_page_size() -> None:
    # Given equivalent UTC filters with duplicate unordered zone IDs.
    project = uuid4()
    a, b = uuid4(), uuid4()
    filters = ObservationFilters(
        site_id=uuid4(),
        zone_id=(b, a, b),
        observed_from=datetime.fromisoformat("2026-11-01T01:30:00-04:00"),
    )
    cursor = encode_cursor(project, filters, observed_at=datetime.now(UTC), observation_id=uuid4())
    # When normalized equivalent bounds are used.
    normalized = filters.model_copy(
        update={"observed_from": datetime.fromisoformat("2026-11-01T05:30:00+00:00")}
    )
    decoded = decode_cursor(cursor, project, normalized)
    # Then canonical scope identity is stable.
    assert decoded is not None
    assert filters.zone_id == tuple(sorted({a, b}))


@pytest.mark.parametrize(
    "value",
    [
        "garbage",
        "e30",
        base64.urlsafe_b64encode(
            b'{"scope":"s","observed_at":"0001-01-01T00:00:00+01:00","observation_id":"00000000-0000-0000-0000-000000000000"}'
        ).decode(),
    ],
)
def test_invalid_cursor_when_structure_or_utc_range_is_invalid(value: str) -> None:
    # Given a malformed cursor.
    # When it crosses the query boundary.
    with pytest.raises(DomainError) as caught:
        decode_cursor(value, uuid4(), ObservationFilters())
    # Then failure is structured and safe.
    assert caught.value.status == 422


def test_byte_ceiling_when_actual_assets_exceed_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    # Given a small source snapshot whose actual generated assets exceed a reduced test limit.
    data = snapshot({"text": "Synthetic"}, canonical([question("text", "text")]))
    monkeypatch.setattr("fieldmaps_api.domain.observation_export.BYTE_LIMIT", 100)
    # When bundle preflight measures actual assets.
    with pytest.raises(DomainError) as caught:
        bundle(data, ObservationExportQuery(), "project")
    # Then no partial bundle returns.
    assert caught.value.status == 422
    assert BYTE_LIMIT == 32 * 1024 * 1024


@pytest.mark.parametrize("bound", ["0001-01-01T00:00:00+01:00", "9999-12-31T23:59:59-01:00"])
def test_filter_utc_overflow_when_boundary_would_leave_datetime_range(bound: str) -> None:
    # Given an aware timestamp beyond representable UTC.
    # When filters are parsed.
    with pytest.raises(ValidationError):
        ObservationFilters.model_validate({"observed_from": bound})


def test_codebook_preserves_meanings_when_versions_share_a_column() -> None:
    # Given two historical versions with different meanings for the same export header.
    old, new = question("a", "shared"), question("a", "shared", "number")
    old["label"], new["label"] = "Old meaning", "New meaning"
    data = snapshot({"a": "old"}, canonical([old]))
    second = data.items[0].model_copy(update={"form_version": "test-v2", "answers": {"a": 2}})
    data = data.model_copy(
        update={
            "items": [*data.items, second],
            "forms": data.forms | {"test-v2": canonical([new])},
            "form_schema_versions": data.form_schema_versions | {"test-v2": 2},
            "total_matching": 2,
        }
    )
    # When codebook and observations are serialized.
    output = assets(data, ObservationExportQuery(), "project")
    book = list(csv.DictReader(StringIO(output["codebook.csv"].decode("utf-8-sig"))))
    rows = list(csv.DictReader(StringIO(output["observations.csv"].decode("utf-8-sig"))))
    # Then one header routes both cells while each version retains its own meaning.
    entries = [entry for entry in book if entry["export_column"] == "shared"]
    assert {(entry["label"], entry["type"]) for entry in entries} == {
        ("Old meaning", "text"),
        ("New meaning", "number"),
    }
    assert rows[0]["shared"] == "old"
    assert rows[1]["shared"] == "2"


def test_codebook_preserves_sets_when_dynamic_columns_are_shared() -> None:
    # Given two dynamic sets that share a header but have distinct labels and options.
    parent = question("parent", "parent", "one")
    parent["options"] = [{"code": "a", "label": "A"}, {"code": "b", "label": "B"}]
    child = question("child", "fallback", "one")
    child["dynamicFrom"] = {
        "question": "parent",
        "sets": {
            "a": {
                "code": "a",
                "exportColumn": "shared",
                "label": "A set",
                "options": [{"code": "x", "label": "Old"}],
            },
            "b": {
                "code": "b",
                "exportColumn": "shared",
                "label": "B set",
                "options": [{"code": "y", "label": "New"}],
            },
        },
    }
    data = snapshot({"parent": "b", "child": "y"}, canonical([parent, child]))
    # When the historical dynamic answer is exported.
    output = assets(data, ObservationExportQuery(), "project")
    book = list(csv.DictReader(StringIO(output["codebook.csv"].decode("utf-8-sig"))))
    row = next(csv.DictReader(StringIO(output["observations.csv"].decode("utf-8-sig"))))
    # Then both set meanings remain explicit and the selected cell is preserved.
    assert row["shared"] == "y"
    assert {
        (entry["label"], entry["values"]) for entry in book if entry["export_column"] == "shared"
    } == {("A set", "x = Old"), ("B set", "y = New")}


@pytest.mark.parametrize("question_id", ["name", "observer", "observer_initials"])
def test_reserved_observer_column_preserves_distinct_answer(question_id: str) -> None:
    # Given an answer that differs from envelope observer metadata.
    data = snapshot(
        {question_id: "captured answer", "raw": "raw answer"},
        canonical([question(question_id, "observer"), question("raw", "answers")]),
    )
    # When the same historical scope is serialized as CSV and GeoJSON.
    csv_output = assets(data, ObservationExportQuery(), "project")
    geo_output = assets(data, ObservationExportQuery(format="geojson"), "project")

    row = next(csv.DictReader(StringIO(csv_output["observations.csv"].decode("utf-8-sig"))))
    features = document(geo_output["observations.geojson"])["features"]
    assert isinstance(features, list)
    feature = features[0]
    assert isinstance(feature, dict)
    properties = feature["properties"]
    assert isinstance(properties, dict)
    # Then reserved metadata names allocate answer columns without dropping captured values.
    assert row["observer"] == "QA"
    assert row["answer_observer"] == "captured answer"
    assert properties["answer_answers"] == "raw answer"
    raw_answers = properties["answers"]
    assert isinstance(raw_answers, dict)
    assert raw_answers[question_id] == "captured answer"
