# WP1 progress (sites and map packages)

> Historical D30 implementation record (October 2026). Instructions, open issues and test counts below describe that work period. Use [current position](../../../plan/current-state.md) and [web task owners](../../../../web/PLAN.md) before starting work; the later zone contract supersedes the original 500-row analysis design.

## done
- read brief, spec, data-layer notes, e2e specs (sites, packages), scan rules, old sample files
- lib/packages.ts rewritten (no token / project id / resolveProjectId; client checks incl. blocking "Every zone has an id", distinct ids, one site outline, CRS, size limits)
- pure helpers: features/sites/{code,view}.ts, features/packages/{history,manifest,forms,checks}.ts, upload-preview.ts (uses layersPlan)
- actions: features/sites/actions.ts (createSiteAction, updateSiteAction), features/packages/actions.ts (packageUploaded)
- components: sites/{SitesScreen,CreateSiteDialog,EditSiteDialog,SiteScreen,parts}.tsx, packages/{UploadStep,VersionHistory,InspectPackage,DownloadPackageButton,CheckBadge}.tsx
- pages: sites/page.tsx, sites/[site]/page.tsx, sites/[site]/packages/page.tsx (history, ?package= inspect, ?step=upload)
- deleted: sites/[site]/zones/**, features/sites/{store,SessionSite,ZoneEditor,ZoneScreen,ZoneContext,VertexHandles,DeviceReadiness,model}, features/packages/{store,SessionPackages,PackagesScreen,model,geometry} (nothing outside my area imported them; QgisScreen and DangerZone no longer do)
- unit tests: tests/unit/{site-code,site-view,package-checks,package-history}.test.mjs (32 tests)
- checks: tsc clean for my files; eslint + prettier clean; test:unit 203/203; grep for fixtures/preview/data imports empty
## next
- nothing left; final report sent
## decisions
- v1: description null clears on PATCH (API supports explicit null)
- site create 409 means the code is taken -> message next to the Code field
- package 422 shows the server validation message (it names the layer problem); other errors use errorCopy
- zone list is one markup (list rows), not table+cards, so the first zone link is visible at 390 px
- upload clears the chosen files after a prepared result so one press cannot make two versions
- default form version: current package's if still published, else newest published non-inventory form (inventory = collector's isInventoryForm rule)
- submission field is `project_file` (the API schema), not `qgis_project` as spec.md says
- client checks now also block what the API refuses: ids must be text, distinct, 1-64 zones, exactly one ground feature with kind = site, projected or non-WGS84 coordinates, size limits; MultiPolygon etc. accepted
