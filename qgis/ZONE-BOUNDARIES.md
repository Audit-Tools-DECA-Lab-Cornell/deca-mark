# GIS plan: preserve recorded zone context

[Master plan](../docs/plan/zone-boundaries/README.md) · [Database specification](../supabase/ZONE-BOUNDARIES.md) · GIS-09 in [PLAN.md](PLAN.md).

## Scope and ownership

Keep QGIS read-only. The GIS owner specifies views/export semantics and acceptance data; the database owner alone writes corresponding migrations. Do not provision new credentials, read secret files, expand reader grants, or retire existing GIS views as a side effect. General per-project GIS login infrastructure remains GIS-01/GIS-02 work; this feature must not pretend it is already shipped.

## Required analysis surfaces

| Surface | Geometry | Required metadata |
| --- | --- | --- |
| Point events | Real observation Point | Observation ID, form, site, round type, recorded package/version/zone UUID/code/label, assignment basis |
| Zone snapshots | MultiPolygon | Package+zone unique key, site, version, historical label, publication metadata |
| Inventory records | Joined recorded zone MultiPolygon, or nonspatial table joined by package+zone | Observation ID and form answers; never a child/activity point |
| Legacy records | Existing geometry retained with unknown historical binding | Legacy zone code and explicit unknown boundary/version; inventory anchor marked as such |

Do not join observations to current site zones. Use package+zone composite binding. Same zone identity across versions is not proof that sampled area is equal; expose version/area for deliberate analysis. Avoid duplicated row counts when joining multipart polygons: one zone feature may be MultiPolygon, not one observation per polygon part.

The current `gis.sample_observations` point view must remain backward compatible. Add companion scoped views or future generic/typed view columns without changing its feature identity or secretly widening project access. GIS-01's older planned numeric-round fields must be reconciled with current Standard/Reliability/Inventory and D26 before implementing its dependent views.

The [projection and export guide](zone-boundaries/README.md) specifies the additive
`gis.recorded_observations`, `gis.point_events`, `gis.zone_snapshots`,
`gis.inventory_records` and `gis.legacy_records` interfaces. They use the existing API
request identity and RLS; no new GIS reader privileges are implied. Exported files are
the authorized local QGIS path until the independent scoped-login work is approved.

CSV preserves IDs/code/recorded label/version/basis. Event GeoJSON uses null geometry for whole-zone inventories, with references to a separate historical zones GeoJSON. A companion inventory polygon export is useful if explicitly labelled and schema documented; do not change event geometry type under existing consumers. The API and QGIS read must agree on filters and record counts.

## Import continuity

QGIS imports create drafts/new packages through the same validation/activation path as browser drawing for managed sites. Preserve known UUID mapping when intentionally updating a zone. If an external layer contains only labels/codes, require explicit identity mapping or assign new identities; never assume a reused label establishes research continuity. Current conversion preserves vector coordinates, not QGIS styling or imagery, and this feature does not broaden supported formats.

## Acceptance

Create synthetic v7/v8 polygons with changed labels/boundaries, one v7 point uploaded after v8, one inventory, legacy point and legacy inventory. Verify scoped SQL views and CSV/GeoJSON retain the original associations, distinct IDs and counts. In QGIS Desktop load the exact historical zone plus point layer and confirm the delayed v7 point is paired with v7. Inventory layer renders its zone once per record and never enters point-event counts.

SQL readback alone does not prove QGIS rendering. If no authorized scoped local reader/project exists, document that desktop acceptance is pending and use local exported GeoJSON to test geometry rendering without claiming live database access. QA-07 separately records whichever live/readback evidence the release requires.
