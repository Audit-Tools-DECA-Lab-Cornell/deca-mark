# WP4 overview, reports, QGIS

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## done
- Pure models + tests: features/{overview,reports,qgis}/model.ts, tests/unit/{overview,reports,qgis}.test.mjs (203/203 unit tests pass).
- Overview: page.tsx, FieldReturnIsland, CoverageSection (async, Suspense) + CoverageIsland, AttentionIsland, ActivityIsland.
- Reports: page.tsx, ReportsScreen (sheet, filters, print), CountBars.
- QGIS: page.tsx, QgisScreen (maps in, records out, columns, NotAvailable).
- Deleted (rm): reports/[report], reports/views, features/reports/{ReportScreen,SavedViewsScreen,summary,views}, features/overview/BlockingIsland, features/qgis/{ReaderGrantsIsland,parts,store}.
- tsc clean in src for my files (only stale .next/dev/types errors remain); eslint + prettier clean; forbidden-import grep empty; nothing imports features/data.

## next
- nothing; final report sent to coordinator

## decisions
- Coverage site = ?site= if it has a current package, else first site with a package AND observations, else first with a package (keeps e2e stable when other specs add package-only sites).
- Own CountBars instead of TypeBars: e2e reads text ("Standard round 4"), TypeBars has no separator between label and count.
- Reports sheet is an A4 "paper" article (data-report-sheet, Day theme) with the old print CSS; filters and page header are outside it and do not print.
- Table cells carry {" "} either side of counts so row text reads "4 2 2" for the coverage e2e.
- Columns table on QGIS page is two columns so it never scrolls sideways (axe scrollable-region rule on phone-390).
