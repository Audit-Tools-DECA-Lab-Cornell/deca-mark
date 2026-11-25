from uuid import UUID, uuid4

import anyio
import pytest

from fieldmaps_api.domain.map_setup_compilation import (
    compile_package,
    reviewed_layer_check,
    validate_map,
)
from fieldmaps_api.domain.map_setup_roles import keep_references
from fieldmaps_api.domain.zone_archive import prepare_import_base
from fieldmaps_api.errors import DomainError
from fieldmaps_api.map_setup_schemas import MapSetupReplace, SetupAssignment
from fieldmaps_api.services.map_setup_imports import convert
from tests.map_setup_fixtures import qgz_request
from tests.test_zone_packages import forms

SITE = UUID("10000000-0000-4000-8000-000000000003")
REQUEST = UUID("10000000-0000-4000-8000-000000000004")


def test_incomplete_setup_cannot_compile_for_observers() -> None:
    # Given an acknowledged draft without boundaries or form.
    content = MapSetupReplace(import_generation=1)
    # When publication assembly is requested.
    with pytest.raises(DomainError) as failure:
        compile_package(SITE, REQUEST, None, content, [], [], None)
    # Then a typed validation rejection retains the draft.
    assert failure.value.code == "validation_failed"


def test_qgis_sources_keep_custom_names_and_manager_overrides_through_preparation() -> None:
    imported = anyio.run(convert, qgz_request("complete").files, "project")
    outline, lawn, canopy = (
        layer.model_copy(update={"name": name})
        for layer, name in zip(
            imported.layers, ("Site perimeter", "Activity lawn", "Oak"), strict=True
        )
    )
    layers = [outline, lawn, canopy]
    assert [item.role for item in keep_references(layers)] == ["ground", "ground", "trees"]
    boundary = outline.features[0]
    excluded = canopy.features[0]
    choices = (
        SetupAssignment(
            source_id=outline.source_id, feature_key=boundary.feature_key, role="outline"
        ),
        SetupAssignment(
            source_id=canopy.source_id, feature_key=excluded.feature_key, role="leave_out"
        ),
    )
    geometry = boundary.feature.geometry.model_dump(mode="json")
    content = MapSetupReplace.model_validate(
        {
            "import_generation": 1,
            "assignments": keep_references(layers, choices),
            "outline": geometry,
            "zones": [
                {
                    "zone_id": uuid4(),
                    "zone_code": "A",
                    "zone_label": "Study area",
                    "geometry": geometry,
                }
            ],
        }
    )
    validate_map(content, layers, [])
    with pytest.raises(DomainError, match="published observation form"):
        compile_package(SITE, REQUEST, None, content, layers, [], imported.project_file)
    bound = content.model_copy(update={"form_version": "play-v1"})
    package = compile_package(SITE, REQUEST, None, bound, layers, [], imported.project_file)
    base = prepare_import_base(
        package, "NORTH", forms(), layer_check=reviewed_layer_check(content, tuple(layers), ())
    )
    assert b'"qgis_layer":"Activity lawn"' in base.layers[0].payload
    assert b'"label":"Zone A"' in base.layers[0].payload
    assert "trees" not in package.layers
    check = next(check for check in base.checks if check.step == "layer-sources")
    assert check.state == "warning"
    assert check.detail == (
        "Sources with features left out: Oak. "
        "Sources with map features included: Site perimeter, Activity lawn."
    )
