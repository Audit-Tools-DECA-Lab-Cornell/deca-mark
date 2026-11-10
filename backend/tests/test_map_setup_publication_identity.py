from uuid import UUID

from fieldmaps_api.map_setup_schemas import MapSetupPublish
from fieldmaps_api.services import map_setup_publication


def test_publish_fingerprint_binds_reviewed_etag() -> None:
    # Given one immutable publish request and two reviewed revisions.
    payload = MapSetupPublish(
        request_id=UUID("94000000-0000-4000-8000-000000000010"), expected_current_package_id=None
    )
    # When the same request is submitted from a different review.
    original = map_setup_publication.publish_fingerprint(payload, '"map-setup:one:1"')
    changed = map_setup_publication.publish_fingerprint(payload, '"map-setup:one:2"')
    # Then the stored idempotency identity distinguishes the reviewed revision.
    assert original != changed
