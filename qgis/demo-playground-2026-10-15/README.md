# Janet's synthetic playground demonstration

**Upload `janet-synthetic-playground.qgz` to a new demonstration site.** It contains its QGS project and all four GeoJSON datasets. No extra source selection, raster, tile service or network basemap is needed by the importer. All geometry is invented near Ithaca for a realistic EPSG:4326 example; it is not a map of a school or research site. Every source feature carries `synthetic=true` and explicit provenance. There are no fabricated observation records.

## Choose the right file

| File | Purpose |
| --- | --- |
| [janet-synthetic-playground.qgz](janet-synthetic-playground.qgz) | Single-file DECA Mark website upload; the importer resolves the contained GeoJSON. |
| [janet-desktop-project.zip](janet-desktop-project.zip) | Portable QGIS Desktop delivery: extract the entire folder, then open its `.qgs`. Keep `data/` beside it. |
| [desktop/janet-synthetic-playground.qgs](desktop/janet-synthetic-playground.qgs) | Open directly in this checkout; it uses the adjacent relative `data/` folder. |

The upload QGZ uses ordinary ZIP members for vector sources supported by this application's importer. Those members do not establish QGIS Desktop's attachment behavior. Use the ordinary QGS folder for Desktop. QGIS styling is for Desktop; DECA Mark imports geometry/properties and uses its own shared map palette.

## Before the meeting: a 5-minute smoke check

1. Use a dedicated project/site named **SYNTHETIC — Janet demo** and accounts authorized for that project. Verify the running web, API and collector build match the intended demo version. Current MOB-29 work and its tests are not a substitute for this device smoke check.
2. In **Forms**, ensure there is a **published play form version** the project can select. Publish/select a separate form that asks only about a zone if demonstrating Inventory; otherwise leave Inventory off. This map carries no form definitions or fixed form-version identifiers.
3. In **Sites**, create the new site, choose **Upload a new version**, select the QGZ, and choose **Read project**. Confirm `ground`, `zones`, `paths` and `trees` resolve. Reading imports a preview; publication is separate.
4. Select the published play form and optional Inventory form. Review the two zone identity rows as **new identities**; use distinct codes such as `A` and `B`. Let the website create site-scoped UUIDs. Source IDs `demo-zone-a` and `demo-zone-b` are import references, not stable production UUIDs. Publish only after validation passes.
5. Download this site's package on the actual collector, save one explicitly synthetic record offline, reconnect with the app open and verify the server receipt and manager record. If this fails, show the available screens while clearly naming the unverified upload step.

## Map contents and live drawing area

The ground outline encloses a west court, east mulch/play area with a climber, a northern lawn/shelter, one entry path and four tree points. Starter Zone A surrounds the court; Zone B surrounds the play area. Their interiors do not overlap. The north lawn deliberately remains unassigned for a live third polygon.

Suggested Zone C rectangle, longitude first: `(-76.50110, 42.44604)`, `(-76.49930, 42.44604)`, `(-76.49930, 42.44640)`, `(-76.50110, 42.44640)`. Draw visually in the manager editor; this is a guide, not an input that the user must type. It fits inside the site and stays north of A/B. A small site gap is allowed and reported. Do not draw over A/B to hide a validation error.

For the historical version story, collect on v1, then edit A's label or boundary and publish v2. Show that the first record still identifies v1 and its recorded zone. A second collection session can adopt v2. Refreshing today's boundaries must never relabel the first record.

## Verification and regeneration

The actual importer is exercised by `backend/tests/test_demo_playground_import.py`: the QGZ and Desktop ZIP each resolve four synthetic layers; starter IDs are unique, zones fit the site without overlap, the north lawn stays free, and QGS sources resolve inside the Desktop ZIP. See [RED evidence](verification/import-red.txt) and [GREEN evidence](verification/import-green.txt). These are artifact/import checks; they do not claim website publication, deployed compatibility, physical collection, inbox delivery or current live GIS access.

Regenerate the synthetic GeoJSON and archives deterministically from the repository root with `uv run qgis/demo-playground-2026-10-15/build.py`. The checked-in Desktop QGS is the authored native project source; the builder preserves it, including native layer identities, CRS and styling. The builder has no third-party dependencies and reads no source research data. Run `backend/.venv/bin/python -m pytest backend/tests/test_demo_playground_import.py -q` afterwards. The QGZ is a sample input; server preparation still owns validation and creates the immutable collector archive. The separate [actual importer/preparation smoke](verification/import-scenario.json) passed all four source checks without publishing a package.

For a meeting sequence, use the [12-minute Janet checklist](../../docs/Janet-Demo-2026-10-15.md).
