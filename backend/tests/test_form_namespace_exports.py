import csv
from io import StringIO
from typing import TYPE_CHECKING

import pytest

from fieldmaps_api.domain.forms import FormDefinition, normalize_answers
from fieldmaps_api.domain.observation_export import assets
from fieldmaps_api.observation_analysis_schemas import ObservationExportQuery
from tests.test_observation_analysis_domain import canonical, question, snapshot
from tests.zone_api_fixtures import document

if TYPE_CHECKING:
    from pydantic import JsonValue


@pytest.mark.parametrize(
    ("export_column", "expected_column"),
    [("Question_Round_Type", "Question_Round_Type"), ("round_type", "answer_round_type")],
)
def test_nested_round_type_answer_keeps_its_own_export_column(
    export_column: str, expected_column: str
) -> None:
    definition = canonical([question("round_type", export_column)])
    answers: dict[str, JsonValue] = {"round_type": "question answer"}
    parsed = FormDefinition.model_validate(definition)
    assert normalize_answers(parsed, answers).answers == answers
    source = snapshot(answers, definition)
    exported = assets(source, ObservationExportQuery(format="csv"), "synthetic")
    row = next(csv.DictReader(StringIO(exported["observations.csv"].decode("utf-8-sig"))))
    assert row["round_type"] == "standard"
    assert row[expected_column] == "question answer"
    geojson = assets(source, ObservationExportQuery(format="geojson"), "synthetic")
    features = document(geojson["observations.geojson"])["features"]
    assert isinstance(features, list)
    event = features[0]
    assert isinstance(event, dict)
    properties = event["properties"]
    assert isinstance(properties, dict)
    assert properties["round_type"] == "standard"
    assert properties[expected_column] == "question answer"
    assert properties["answers"] == answers
    assert document(geojson["forms.json"])["test-v1"] == definition
