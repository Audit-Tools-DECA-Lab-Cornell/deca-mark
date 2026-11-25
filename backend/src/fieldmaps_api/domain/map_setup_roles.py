from collections.abc import Sequence
from typing import Literal, assert_never

from fieldmaps_api.domain.geojson import Feature
from fieldmaps_api.map_setup_schemas import SetupAssignment, SetupLayer


def reference_role(layer: str, feature: Feature) -> Literal["ground", "paths", "trees"]:
    geometry = feature.geometry.type
    match geometry:
        case "LineString" | "MultiLineString":
            return "paths"
        case "Point" | "MultiPoint":
            return "trees"
        case "Polygon" | "MultiPolygon":
            kind = (feature.text("kind") or "").casefold()
            name = layer.strip().casefold()
            if kind == "tree" or (not kind and name in {"tree", "trees"}):
                return "trees"
            if kind == "path" or (not kind and name in {"path", "paths", "pathway", "pathways"}):
                return "paths"
            return "ground"
    assert_never(geometry)


def keep_references(
    layers: Sequence[SetupLayer], previous: Sequence[SetupAssignment] = ()
) -> tuple[SetupAssignment, ...]:
    saved = {(item.source_id, item.feature_key): item for item in previous}
    return tuple(
        saved.get((layer.source_id, item.feature_key))
        or SetupAssignment(
            source_id=layer.source_id,
            feature_key=item.feature_key,
            role=reference_role(layer.name, item.feature),
        )
        for layer in layers
        for item in layer.features
    )
