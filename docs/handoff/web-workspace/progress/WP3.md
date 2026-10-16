# WP3 data (table + observation detail)

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## done
- Read brief, spec, data-layer and shell notes, e2e data.spec.ts + support/{ui,scan}.ts, existing files.

## next
- features/data/view.ts (pure: URL filters, row prep, summary, filters) + unit tests
- DataScreen (client), FilterBar, DataTable, ExportObservations, data/page.tsx
- Observation detail (server component) + data/[observation]/page.tsx
- Delete old sample files not imported outside the area; tsc/eslint/prettier/test:unit

## decisions
- New files get new names (view.ts, ExportObservations.tsx) so old `filters.ts`/`ExportDialog.tsx` that other WPs still import keep compiling until they are rewired; old ones deleted at the end only if no outside importer remains.
- Server filters (site, round) via router.replace in a transition; client filters (zone, observer, from, to, q) via history.replaceState and read back with useSearchParams.
- Export covers the rows in view (after client filters), one file per download: CSV, GeoJSON or codebook.

## update 1
- done: view.ts (+ tests/unit/data-view.test.mjs, 11 tests, test:unit 134/134), DataTable, FilterBar, ExportObservations, DataScreen, data/page.tsx, ObservationDetail (server component), data/[observation]/page.tsx. tsc clean for my files.
- deleted: SaveViewDialog, FilterRow, ObservationTable, SelectedRecord, useDataFilters (no outside importers).
- kept for now (other WPs still import them): filters.ts (overview, reports), markers.ts (reports, qgis), review.ts (sites, reports, qgis), savedViews.ts (reports), ExportDialog.tsx + exportRows.ts + exportColumns.ts (qgis). Re-check at the end.

## update 2 (final)
- done: limited-note wording by exact total, Export disabled reason; render smoke (SSR harness in scratchpad, 6 scenarios) clean; tsc clean for my files; eslint + prettier clean; test:unit 134/134.
- old files still imported outside features/data (kept, WP10 deletes once WP1/WP4 rewire): filters.ts (overview/BlockingIsland, reports/views), markers.ts (reports/[report] page, qgis page, ReportScreen, QgisScreen), review.ts (sites/ZoneScreen, ReportScreen, SavedViewsScreen, QgisScreen), savedViews.ts (SavedViewsScreen), ExportDialog.tsx (QgisScreen) and, through it, exportRows.ts + exportColumns.ts.
