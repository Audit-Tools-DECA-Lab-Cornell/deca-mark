import json

import anyio

from fieldmaps_api.services.project_import import import_project
from tests.test_project_import import document, ground_layer, packed, request


def test_source_identity_is_stable_for_duplicate_names() -> None:
    # Given two different QGIS layers sharing a display name.
    xml = document().replace(b"<layername>zones</layername>", b"<layername>ground</layername>")
    uploaded = request(
        {
            "site.qgz": packed(
                {"site.qgs": xml, "ground.geojson": json.dumps(ground_layer()).encode()}
            )
        }
    )
    # When converted twice, including a missing source issue.
    first = anyio.run(import_project, uploaded)
    second = anyio.run(import_project, uploaded)
    # Then role review can distinguish successful and missing layers across retries.
    identities = [first.layers[0].source_id, first.issues[0].source_id]
    assert all(identities)
    assert len(set(identities)) == 2
    assert identities == [second.layers[0].source_id, second.issues[0].source_id]
