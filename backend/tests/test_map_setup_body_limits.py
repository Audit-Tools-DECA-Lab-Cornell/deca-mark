from fieldmaps_api.body_limits import MIB, body_limit


def test_legacy_package_import_keeps_its_existing_limit() -> None:
    assert body_limit("POST", "/v1/projects/p/packages/import") == 24 * MIB


def test_map_setup_supports_bounded_real_project_and_edit_bodies() -> None:
    assert body_limit("POST", "/v1/projects/p/sites/s/map-setups/import") == 24 * MIB
    assert body_limit("POST", "/v1/projects/p/sites/s/map-setups/d/sources") == 24 * MIB
    assert body_limit("PUT", "/v1/projects/p/sites/s/map-setups/d") == 24 * MIB
