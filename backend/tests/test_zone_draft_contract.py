from typing import Literal
from uuid import uuid4

import pytest
from pydantic import JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.zone_draft_schemas import DraftPublish, DraftReplace, ZoneDraftCreate
from fieldmaps_api.zone_geometry_schemas import ZoneGeometry


def zone(positions: int = 5, code: str = "A") -> dict[str, JsonValue]:
    corners = [[0.0, 0.0], [0.01, 0.0], [0.01, 0.01], [0.0, 0.01]]
    ring = [corners[index % 4] for index in range(positions - 1)] + [corners[0]]
    return TypeAdapter(dict[str, JsonValue]).validate_python(
        {
            "zone_id": str(uuid4()),
            "zone_code": code,
            "zone_label": "Synthetic zone",
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        }
    )


@pytest.mark.parametrize("positions", [2_000, 2_001])
def test_zone_position_limit_when_draft_is_replaced(positions: int) -> None:
    # Given the limit or one over it, when saved, then only bounded geometry is retained.
    payload = {"zones": [zone(positions)], "change_note": ""}
    if positions == 2_000:
        assert len(DraftReplace.model_validate(payload).zones) == 1
    else:
        with pytest.raises(ValidationError):
            DraftReplace.model_validate(payload)


@pytest.mark.parametrize("count", [250, 251])
def test_zone_count_limit_when_draft_is_replaced(count: int) -> None:
    # Given unique synthetic zones, when saved, then 250 is accepted and 251 is rejected.
    payload = {"zones": [zone(code=f"Z{index}") for index in range(count)], "change_note": ""}
    if count == 250:
        assert len(DraftReplace.model_validate(payload).zones) == count
    else:
        with pytest.raises(ValidationError):
            DraftReplace.model_validate(payload)


@pytest.mark.parametrize("extra_positions", [0, 5])
def test_package_position_limit_when_draft_is_replaced(extra_positions: int) -> None:
    # Given ten maximum-size zones, when an extra ring is added, then the package bound applies.
    zones = [zone(2_000, f"Z{index}") for index in range(10)]
    if extra_positions:
        zones[-1] = zone(1_996, "Z9")
        zones.append(zone(5, "extra"))
    payload = {"zones": zones, "change_note": ""}
    if extra_positions:
        with pytest.raises(ValidationError):
            DraftReplace.model_validate(payload)
    else:
        assert len(DraftReplace.model_validate(payload).zones) == 10


@pytest.mark.parametrize("field", ["zone_id", "zone_code"])
def test_duplicate_identity_when_draft_is_replaced(field: Literal["zone_id", "zone_code"]) -> None:
    # Given a repeated UUID or code, when saved, then ambiguous identity is rejected.
    first, second = zone(code="A"), zone(code="B")
    second[field] = first[field]
    with pytest.raises(ValidationError):
        DraftReplace.model_validate({"zones": [first, second], "change_note": ""})


@pytest.mark.parametrize("code", ["A B", "é", "_A", "A" * 101, "A\n"])
def test_invalid_code_when_draft_is_replaced(code: str) -> None:
    # Given a non-contract code, when saved, then it cannot become a stable identity.
    with pytest.raises(ValidationError):
        DraftReplace.model_validate({"zones": [zone(code=code)], "change_note": ""})


def test_empty_draft_when_all_zones_are_removed() -> None:
    # Given no finished zones, when saved, then work remains resumable before publication.
    assert DraftReplace.model_validate({"zones": [], "change_note": ""}).zones == ()


def test_label_when_draft_is_saved() -> None:
    # Given surrounding whitespace, when saved, then the label is trimmed without changing code.
    entry = zone(code="Zone-A_1")
    entry["zone_label"] = "  Meadow  "
    result = DraftReplace.model_validate({"zones": [entry], "change_note": "  Synthetic  "})
    assert (result.zones[0].zone_label, result.change_note) == ("Meadow", "Synthetic")


@pytest.mark.parametrize("label", [" ", "A" * 201])
def test_invalid_label_when_draft_is_saved(label: str) -> None:
    # Given a blank or oversized label, when saved, then it is rejected.
    entry = zone()
    entry["zone_label"] = label
    with pytest.raises(ValidationError):
        DraftReplace.model_validate({"zones": [entry], "change_note": ""})


def test_missing_binding_when_manager_requests_are_parsed() -> None:
    # Given incomplete requests, when parsed, then no package identity is inferred.
    with pytest.raises(ValidationError):
        ZoneDraftCreate.model_validate({"request_id": str(uuid4())})
    with pytest.raises(ValidationError):
        DraftPublish.model_validate({"request_id": str(uuid4())})


def test_zone_draft_creation_requires_a_base_package_and_rejects_form_overrides() -> None:
    payload = {"request_id": str(uuid4()), "base_package_id": str(uuid4())}
    assert ZoneDraftCreate.model_validate(payload).base_package_id
    with pytest.raises(ValidationError):
        ZoneDraftCreate.model_validate(payload | {"inventory_form_version": "inventory-v1"})


@pytest.mark.parametrize("multipart", [False, True])
@pytest.mark.parametrize("total", [2_000, 2_001])
def test_positions_across_rings_when_zone_is_parsed(*, multipart: bool, total: int) -> None:
    # Given positions split across rings or parts, when parsed, then the full zone count applies.
    large = TypeAdapter(dict[str, JsonValue]).validate_python(zone(total - 5)["geometry"])
    small = TypeAdapter(dict[str, JsonValue]).validate_python(zone(5)["geometry"])
    left = TypeAdapter(list[JsonValue]).validate_python(large["coordinates"])
    right = TypeAdapter(list[JsonValue]).validate_python(small["coordinates"])
    payload = {
        "type": "MultiPolygon" if multipart else "Polygon",
        "coordinates": [left, right] if multipart else left + right,
    }
    parser = TypeAdapter[ZoneGeometry](ZoneGeometry)
    if total == 2_000:
        assert parser.validate_python(payload).type == payload["type"]
    else:
        with pytest.raises(ValidationError):
            parser.validate_python(payload)
