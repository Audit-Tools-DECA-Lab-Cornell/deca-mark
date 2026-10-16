from datetime import UTC, datetime
from uuid import uuid4

import pytest
from pydantic import ValidationError

from fieldmaps_api.domain.observation_filters import decode_cursor, encode_cursor
from fieldmaps_api.observation_analysis_schemas import ObservationFilters


@pytest.mark.parametrize(
    "bbox",
    [
        "",
        "0,0,1",
        "0,0,1,1,2",
        "west,0,1,1",
        "nan,0,1,1",
        "0,-inf,1,1",
        "-181,0,1,1",
        "0,-91,1,1",
        "0,0,181,1",
        "0,0,1,91",
        "1,0,0,1",
        "0,1,1,0",
        "0,0,0,1",
        "0,0,1,0",
        "170,-10,-170,10",
    ],
)
def test_bbox_rejects_malformed_nonfinite_out_of_range_or_empty_bounds(bbox: str) -> None:
    with pytest.raises(ValidationError):
        ObservationFilters.model_validate({"bbox": bbox})


def test_bbox_accepts_world_extent() -> None:
    filters = ObservationFilters.model_validate({"bbox": "-180,-90,180,90"})
    assert filters.bbox == (-180, -90, 180, 90)


def test_bbox_cursor_normalizes_equivalent_numeric_notation() -> None:
    project = uuid4()
    first = ObservationFilters.model_validate({"bbox": "-77,42,-76,43"})
    equivalent = ObservationFilters.model_validate({"bbox": "-7.7e1,42.0,-76.0,43.00"})
    token = encode_cursor(project, first, observed_at=datetime.now(UTC), observation_id=uuid4())
    assert decode_cursor(token, project, equivalent) is not None
