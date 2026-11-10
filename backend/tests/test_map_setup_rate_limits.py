from fieldmaps_api.rate_limits import ZONE_PUBLICATION, ZONE_VALIDATION, policy_for


def test_existing_package_publication_keeps_its_rate_policy() -> None:
    assert policy_for("POST", "/v1/projects/p/packages") == ZONE_PUBLICATION


def test_map_setup_uses_existing_publication_and_validation_limits() -> None:
    assert policy_for("POST", "/v1/projects/p/sites/s/map-setups/d/publish") == ZONE_PUBLICATION
    assert policy_for("POST", "/v1/projects/p/sites/s/map-setups/d/validate") == ZONE_VALIDATION
