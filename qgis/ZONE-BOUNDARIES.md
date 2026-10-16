# GIS plan: recorded map versions

[Master plan](../docs/plan/zone-boundaries/README.md) · [Canonical contract](../docs/plan/zone-boundaries/contract.md) · [Database specification](../supabase/ZONE-BOUNDARIES.md) · [GIS task status](PLAN.md)

This specification follows CON-06’s current contract. DB-19 and BE-22 now supply the current baseline and API/export behavior with local acceptance. GIS-09’s 2026-10-11 Desktop/provider evidence predates that rewrite; it does not prove current-contract Desktop or hosted compliance. See the [current roadmap](../docs/plan/current-state.md) and [current export versus historical tooling guide](zone-boundaries/README.md).

Map versions v1 and v2 identify successive per-site packages. Both use the only API prefix, `/v1`, and the single zone-aware archive format.

## Scope and ownership

Keep QGIS read-only. The GIS owner specifies projections, joins, exports and rendering checks; the database owner writes SQL. This work does not provision credentials, read secrets or widen reader permissions. General scoped Desktop logins remain independent GIS-01/GIS-02 work.

Until an authorized scoped live reader is provisioned, use the canonical API's complete authorized export for local QGIS analysis. Existing reports and tooling are evidence of their recorded implementation only.

## Required analysis surfaces

| Surface | Geometry | Required attribution |
| --- | --- | --- |
| Point events | Real Standard/Reliability Point | Observation ID, site, form, round, recorded package/version and zone UUID/code/label |
| Zone snapshots | One full MultiPolygon per package+zone | Unique snapshot key, site, package version, frozen label/code, anchor, digest and actual publication metadata |
| Inventory records | Recorded zone MultiPolygon, or nonspatial table joined to it | Observation ID and answers, whole-zone support; event geometry remains null |

Common read metadata and the `gis.point_events`, `gis.zone_snapshots` and `gis.inventory_records` projections must follow these semantics under authorized database visibility. A view or export grants no new project access.

Join observations to snapshots using package and zone UUIDs plus tenant/site keys. Never fill attribution from the site's current package. A stable zone UUID across map versions does not mean its sampled area is unchanged; expose the recorded version and area for deliberate comparison.

Keep multipart geometry as one MultiPolygon. Count observation IDs, not polygon parts or display anchors. Inventory never enters point-event layers or point counts.

## Canonical exports and imports

Read `GET /v1/projects/{project_id}/observations/export?format=geojson` and CSV with the same authorized filters. Each ZIP contains observations, codebook, metadata, forms and historical zones from one snapshot. Preserve export `package_id`, `map_version`, `zone_id`, `zone_code`, recorded `zone_label_at_capture` and `spatial_support`; API/SQL metadata uses `package_version` for that same recorded map version.

Event GeoJSON has null geometry for Inventory, with an exact package+zone reference to the historical zone file. Add a separate clearly labelled inventory polygon layer by that join. Map/table/export filters and record counts must agree. Separate downloads during concurrent writes are not themselves one shared snapshot.

QGIS conversion preserves vector coordinates; it saves nothing. The subsequent first package upload or successor upload supplies explicit feature-to-zone identity mapping and uses the same validation/finalization path as manager draft publication. Reused labels never infer continuity.

## Acceptance

Use fresh synthetic map-v1/map-v2 packages: change a zone's label and boundary, upload a delayed map-v1 point after map v2, and include an Inventory record. A MultiPolygon snapshot remains one zone feature, while every Inventory row remains one observation.

Compare authorized SQL projections with complete API CSV/GeoJSON exports on package, zone, label, geometry and counts. In QGIS load the recorded map-v1 zones and point events, verify the delayed point against map v1, and render inventories as their whole recorded polygons.

Repeat scoped visibility and Training isolation checks after DB-19/BE-22. A loaded export or SQL readback does not prove a live Desktop connection. Record actual QGIS provider/rendering, Desktop interaction and live-reader evidence separately in [QA-07](../docs/plan/verification.md).

The [projection/export guide](zone-boundaries/README.md) separates current manual import from the historical `prepare.py`/`render.py` adapters, which still require removed fields and need alignment before reuse. The [earlier local report](../docs/reviews/zone-boundaries-2026-10-11/gis09.md) remains historical evidence. Task status remains in [PLAN.md](PLAN.md); hosted/live acceptance is not implied by this specification.
