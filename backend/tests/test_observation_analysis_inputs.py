"""Signed query validation runs before opening a database transaction."""

from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from fieldmaps_api.errors import ErrorEnvelope
from tests.signing import PROJECT

OBSERVATIONS = f"/v1/projects/{PROJECT}/observations"


@pytest.mark.parametrize(
    "filters",
    [
        {"site_id": "malformed"},
        {"zone_id": str(uuid4())},
        {"limit": "501"},
        {"observer": "             "},
        {"observer": "1234567890123"},
        {"observed_from": "2026-11-01T01:00:00"},
        {"observed_from": "0001-01-01T00:00:00+01:00"},
        {"observed_before": "9999-12-31T23:59:59-01:00"},
        {"observed_from": "2026-10-11T00:00:00Z", "observed_before": "2026-10-11T00:00:00Z"},
    ],
)
def test_invalid_filter_when_query_is_not_scoped(
    validation_client: TestClient, filters: dict[str, str]
) -> None:
    # Given an invalid filter combination or value.
    # When the historical page is requested.
    response = validation_client.get(OBSERVATIONS, params=filters)
    # Then safe structured validation is returned.
    assert response.status_code == 422, response.text
    error = ErrorEnvelope.model_validate_json(response.content)
    assert error.error.details["issues"] == [
        {"code": "invalid_filter", "zone_ids": [], "path": "", "message": "Invalid query"}
    ]


@pytest.mark.parametrize("extra", [{"limit": "10"}, {"cursor": "abc"}])
def test_export_rejects_page_controls_when_scope_requested(
    validation_client: TestClient, extra: dict[str, str]
) -> None:
    # Given pagination controls inappropriate for a complete export.
    # When they are included in its query.
    response = validation_client.get(OBSERVATIONS + "/export", params=extra)
    # Then it refuses a potentially misleading scope.
    assert response.status_code == 422


@pytest.mark.parametrize("suffix", ["", "/summary", "/export"])
def test_bbox_rejects_invalid_coordinates(validation_client: TestClient, suffix: str) -> None:
    # Given a reversed longitude interval.
    # When any filtered read is requested.
    response = validation_client.get(OBSERVATIONS + suffix, params={"bbox": "1,0,0,1"})
    # Then the query fails at the validation boundary.
    assert response.status_code == 422, response.text
