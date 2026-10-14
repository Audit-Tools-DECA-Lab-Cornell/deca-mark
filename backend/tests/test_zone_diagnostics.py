from types import SimpleNamespace

from fieldmaps_api.zone_diagnostics import metadata


def test_zone_diagnostics_allow_only_static_operation_and_safe_counts() -> None:
    assert metadata(
        {
            "route": SimpleNamespace(operation_id="publishZoneDraft"),
            "fieldmaps_zone_count": 3,
            "fieldmaps_zone_archive_bytes": 2048,
            "path": "/private/site/geometry",
            "answers": {"private": "research"},
        }
    ) == {"operation": "publishZoneDraft", "zone_count": 3, "archive_bytes": 2048}


def test_other_routes_keep_static_operation_without_zone_counts() -> None:
    assert metadata({}) == {}
    assert metadata({"route": SimpleNamespace(operation_id=None)}) == {}
    assert metadata(
        {"route": SimpleNamespace(operation_id="health"), "fieldmaps_zone_count": 3}
    ) == {"operation": "health"}
