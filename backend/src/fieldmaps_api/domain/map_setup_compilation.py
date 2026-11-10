"""Compile reviewed setup geometry into the unchanged published-package contract."""

from uuid import UUID

from pydantic import TypeAdapter, ValidationError

from fieldmaps_api.domain.geojson import Feature, FeatureCollection, Geometry
from fieldmaps_api.domain.packages import ProjectFile
from fieldmaps_api.errors import ValidationFailedError
from fieldmaps_api.map_setup_schemas import MapSetupReplace, SetupIssue, SetupLayer, SetupRole
from fieldmaps_api.zone_draft_schemas import DraftReplace
from fieldmaps_api.zone_import_schemas import PackageRequest, ZoneIdentityMapping

GEOMETRY: TypeAdapter[Geometry] = TypeAdapter(Geometry)


def compile_package(  # noqa: PLR0913, PLR0917 - canonical package context and reviewed input
    site: UUID,
    request: UUID,
    expected: UUID | None,
    content: MapSetupReplace,
    layers: list[SetupLayer],
    issues: list[SetupIssue],
    project: ProjectFile | None,
) -> PackageRequest:
    if content.outline is None or not content.zones or not content.form_version:
        message = "Add a site outline, at least one zone and a published form before publishing."
        raise ValidationFailedError(message)
    validate_zone_names(content)
    source = {
        (layer.source_id, item.feature_key): item.feature
        for layer in layers
        for item in layer.features
    }
    assigned: dict[tuple[str, str], SetupRole] = {
        (item.source_id, item.feature_key): item.role for item in content.assignments
    }
    if len(assigned) != len(content.assignments) or set(assigned) != set(source):
        message = "Review every imported feature before publishing."
        raise ValidationFailedError(message)
    omitted = set(content.confirmed_omissions)
    if any(issue.source_id not in omitted for issue in issues):
        message = "Review each layer that could not be imported before publishing."
        raise ValidationFailedError(message)
    ground = [
        Feature(
            type="Feature",
            geometry=GEOMETRY.validate_python(content.outline.model_dump()),
            properties={"kind": "site"},
        )
    ]
    paths: list[Feature] = []
    trees: list[Feature] = []
    references = {"ground": ground, "paths": paths, "trees": trees}
    allowed = {
        "ground": {"Polygon", "MultiPolygon"},
        "paths": {"LineString", "MultiLineString", "Polygon", "MultiPolygon"},
        "trees": {"Point", "MultiPoint", "Polygon", "MultiPolygon"},
        "outline": {"Polygon", "MultiPolygon"},
        "zones": {"Polygon", "MultiPolygon"},
    }
    for key, role in assigned.items():
        feature = source[key]
        if role == "leave_out":
            continue
        if feature.geometry.type not in allowed[role]:
            message = "Choose a role compatible with the imported feature's geometry."
            raise ValidationFailedError(message)
        if role in references:
            references[role].append(reference_feature(feature, role))
    zone_features = [
        Feature(
            type="Feature",
            geometry=GEOMETRY.validate_python(z.geometry.model_dump()),
            properties={"id": str(z.zone_id), "name": z.zone_label},
        )
        for z in content.zones
    ]
    body = {
        "ground": FeatureCollection(type="FeatureCollection", features=ground).model_dump(
            mode="json"
        ),
        "zones": FeatureCollection(type="FeatureCollection", features=zone_features).model_dump(
            mode="json"
        ),
    }
    if paths:
        body["paths"] = FeatureCollection(type="FeatureCollection", features=paths).model_dump(
            mode="json"
        )
    if trees:
        body["trees"] = FeatureCollection(type="FeatureCollection", features=trees).model_dump(
            mode="json"
        )
    return PackageRequest.model_validate(
        {
            "site_id": site,
            "request_id": request,
            "expected_current_package_id": expected,
            "form_version": content.form_version,
            "inventory_form_version": content.inventory_form_version,
            "layers": body,
            "project_file": project,
            "leave_out_online_basemaps": sorted(
                {issue.layer for issue in issues if issue.kind == "online_basemap"}
            ),
            "zone_identity_map": [
                ZoneIdentityMapping(
                    source_feature_id=str(z.zone_id), zone_id=z.zone_id, zone_code=z.zone_code
                )
                for z in content.zones
            ],
            "change_note": content.change_note,
        }
    )


def reference_feature(feature: Feature, role: SetupRole) -> Feature:
    properties = dict(feature.properties)
    if role == "ground" and properties.get("kind") == "site":
        properties["kind"] = "ground"
    return feature.model_copy(update={"properties": properties})


def validate_zone_names(content: MapSetupReplace) -> None:
    try:
        DraftReplace.model_validate(
            {"zones": [z.model_dump() for z in content.zones], "change_note": content.change_note}
        )
    except ValidationError as error:
        message = "Give each zone a name and a unique code before publishing."
        raise ValidationFailedError(message) from error
