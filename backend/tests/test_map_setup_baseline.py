import anyio
import pytest

from fieldmaps_api.services.project_import import import_project
from tests.map_setup_fixtures import Scenario, qgz_request


@pytest.mark.parametrize(
    ("scenario", "names", "issues"),
    [
        ("outline-no-zones", ["ground"], 0),
        ("references-only", ["trees"], 0),
        ("complete", ["ground", "zones", "trees"], 0),
        ("missing-source", ["ground"], 1),
        ("remote-only", [], 1),
    ],
)
def test_import_preserves_available_geometry_without_requiring_zones(
    scenario: Scenario, names: list[str], issues: int
) -> None:
    # Given a real QGZ with the named boundaries absent.
    submission = qgz_request(scenario)
    # When the unchanged native importer converts it.
    result = anyio.run(import_project, submission)
    # Then available geometry is preserved without invented boundaries.
    assert [layer.name for layer in result.layers] == names
    assert len(result.issues) == issues
