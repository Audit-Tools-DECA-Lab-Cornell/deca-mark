# Testing DECA Mark on a real QGIS map

How to get a base map into QGIS, draw your own site on it, load that site into the mobile collector, and check your collected points in QGIS on top of the base map.

Written September 21, 2026 against the code in this repository. Nothing below has been run end to end yet; the QGIS steps use standard QGIS features, and the app steps follow the current code.

## Read this first: three facts that shape the steps

1. **The server accepts a base map package; the phone does not fetch one yet.** The web application's **Base maps** screen uploads your exported layers and optional `.qgz` to `POST /v1/projects/{project}/packages`, where the API checks them, derives zones and an extent, and stores an immutable versioned archive. The collector still reads its site geometry from code (`mobile/src/maps/sample-site.ts`, used by `mobile/src/packages/bundled.ts`), so getting your map onto a _device_ still means putting exported files in the repository and reloading the app. Part 4 below is that path.
2. **The app draws vector shapes only, not imagery.** Its base map is your site outline, buildings, paths, zones, and trees drawn as flat shapes. Satellite imagery lives in QGIS, not on the phone.
3. **Observation uploads now resolve the site and form from the database.** The API takes any `site_id` and `form_version` that exist in the project and validates each answer against that form's definition, rather than the two string literals it used to accept. A site or form you have not seeded is still rejected, so unless `janet-test-v1` and its site have been inserted, put your geometry into the **Sample garden practice** package and keep its `siteId` unchanged to see your points in QGIS.

## The whole flow

```text
QGIS: add base map ─► draw site layers ─► export GeoJSON (EPSG:4326)
                                                   │
                                                   ▼
             mobile/src/maps/sites/<your-site>/*.json + edit sample-site.ts
                                                   │
                                                   ▼
        App: open "Sample garden practice" ─► place points ─► auto-upload
                                                   │
                                                   ▼
        QGIS: refresh "FieldMaps observations (live)" over the base map
```

Rough time: 15 minutes for Part 1, 30–60 minutes to draw a small site, 15 minutes to load it into the app.

---

## Part 1: Get a base map in QGIS (about 15 minutes)

QGIS 4.2.2 is installed at `/Applications/QGIS-final-4_2_2.app`.

### Option A: OpenStreetMap streets (built in)

1. Open QGIS and create a new project (**Project → New**).
2. In the **Browser** panel, expand **XYZ Tiles** and double-click **OpenStreetMap**.
3. Zoom to your site. Use the search box at the bottom left (the locator) or **View → Zoom to…** with coordinates.

### Option B: Satellite imagery (best for drawing a playground)

1. In the **Browser** panel, right-click **XYZ Tiles → New Connection…**
2. Name: `Esri World Imagery`
3. URL:

   ```text
   https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
   ```

4. Max zoom level: `19`. Click **OK**, then double-click the new connection to add it.

Other sources:

- **New York State orthoimagery** (sharper for Ithaca-area sites): search the NYS GIS Clearinghouse at gis.ny.gov for its orthoimagery WMS service, then add it through **Layer → Add Layer → Add WMS/WMTS Layer**.
- **QuickMapServices plugin** (**Plugins → Manage and Install Plugins**, search "QuickMapServices"): one menu with many base maps.
- **Your own drone image or site plan**: if it is a GeoTIFF, drag it into QGIS. If it is a plain image or PDF, use **Layer → Georeferencer** to pin it to real coordinates first.

**Terms of use:** these tile services are for viewing and tracing in QGIS. Do not bulk-download them to ship inside the app. Check each provider's terms before using their imagery in a publication.

These background maps never reach the package or the phones. Uploading a project that uses one needs the manager's confirmation that it is left out (the API refuses the upload until the request names the layer); the version then records a warning that names the map, and observers see the vector layers only.

### Set the project coordinate system

1. Click the CRS button at the bottom right of the QGIS window.
2. Pick `EPSG:3857` (Web Mercator) for display. This matches the tile base maps.
3. Save the project somewhere outside `qgis/` for your own work, for example `~/Documents/DECA Mark/my-site.qgz`.

---

## Part 2: Draw your site (30–60 minutes for one playground)

Create one GeoPackage file holding one layer per kind of shape. The app understands these five:

| Layer    | Geometry | Required field                 | Shown in the app as                                    |
| -------- | -------- | ------------------------------ | ------------------------------------------------------ |
| `ground` | Polygon  | `kind` = `site` or `structure` | Site outline and buildings in the base map             |
| `paths`  | Line     | none                           | Paths overlay                                          |
| `trees`  | Point    | none                           | Trees overlay                                          |
| `zones`  | Polygon  | `id`, `label`                  | Zone polygons overlay and the zone picker on the brief |

1. **Layer → Create Layer → New GeoPackage Layer…**
2. Database: `my-site.gpkg`. Table name: `ground`. Geometry type: **Polygon**. CRS: **EPSG:4326**.
3. Add a text field `kind`. Click **OK**.
4. Repeat for `paths` (LineString), `trees` (Point), and `zones` (Polygon, text fields `id` and `label`), saving into the same `my-site.gpkg`.
5. Select a layer, click the pencil (**Toggle Editing**), then **Add Polygon/Line/Point Feature**. Trace over the imagery. Right-click to finish each shape and fill in its fields.
6. Draw exactly **one** `ground` feature with `kind = site` (the whole site outline). Draw each building or play structure as `kind = structure`.
7. Draw zones as **rectangles** (turn on **View → Toolbars → Shape Digitizing** and use a rectangle tool). The app stores each zone as a west/south/east/north box, not a free polygon.
8. Save edits (pencil again → **Save**).

---

## Part 3: Export for the app (about 5 minutes)

For each of `ground`, `paths`, `trees`:

1. Right-click the layer → **Export → Save Features As…**
2. Format: **GeoJSON**.
3. File name: `mobile/src/maps/sites/my-site/ground.json` (use `.json`, not `.geojson`; the app's bundler only imports `.json`).
4. CRS: **EPSG:4326**. This is required. The app reads longitude/latitude.
5. Under **Layer Options**, set `RFC7946` to `YES` and `COORDINATE_PRECISION` to `7`.
6. Click **OK**.

For zones you only need numbers, not a file:

1. Open the `zones` attribute table and click **Open Field Calculator**. Add four virtual decimal fields: `x_min($geometry)`, `y_min($geometry)`, `x_max($geometry)`, `y_max($geometry)`.
2. Write down `west = x_min`, `south = y_min`, `east = x_max`, `north = y_max`, plus a centre point, for each zone.

Also note the whole site's extent: right-click `ground` → **Properties → Information → Extent**. Add a small margin (about 0.001°) on each side. This becomes the map's pan limit.

**Privacy:** if your site or its layout is not public, do not commit these files. Keep them uncommitted or ask before adding them to Git.

---

## Part 3b (optional): upload the package to the server (about 5 minutes)

This stores your site as a prepared, versioned package the API can serve. It does not change what the phone shows; Part 4 still does that.

1. Export `zones` as GeoJSON too, the same way as the other layers (EPSG:4326, `RFC7946` = `YES`). Each zone feature needs `id` and `label`.
2. Start the web application (`pnpm dev`) and open **Base maps**.
3. Pick the site and the form version, attach `ground.json` and `zones.json` (both required) plus `paths.json`, `trees.json` and your `.qgz` if you have them, and paste an access token for an account with the **manager** role on the project.
4. Submit. The server runs five checks and shows each one:

   | Check                | What it means                                                                                                                                                                                             |
   | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Layers present       | `ground` and `zones` are there and parse as GeoJSON                                                                                                                                                       |
   | Layer sources        | every layer the project file names has geometry in the upload                                                                                                                                             |
   | Coordinate reference | every position is inside WGS 84, and no layer declares another CRS. The project's own CRS is reported, not enforced: Part 1 has you draw over Web Mercator tiles, and what ships is the exported geometry |
   | Imagery licence      | an online background map (an XYZ or WMS layer) is left out only when you confirm it, and the version then carries a warning naming it; an unconfirmed one refuses the upload; institution-held files pass |
   | Derived geometry     | zones become boxes and the site gets a padded extent                                                                                                                                                      |

   A package that fails a check is refused with its reason and nothing is stored: the site keeps its current version, and no blocked version appears in the history.

5. `GET /v1/projects/{project}/packages` lists versions, and `.../packages/{id}/archive` returns the zip. The archive is deterministic: the same submission yields the same `sha256`, which is also the ETag.

If the web application has no API configured (`NEXT_PUBLIC_DECAMARK_API_URL`), the screen downloads the assembled submission instead of pretending to upload it.

---

## Part 4: Load your site into the app (about 15 minutes)

All edits are in `mobile/src/maps/sample-site.ts`. The practice and Riverside packages both read this file, so both will show your site.

1. Import your exported files at the top:

   ```ts
   import groundData from "./sites/my-site/ground.json";
   import pathsData from "./sites/my-site/paths.json";
   import treesData from "./sites/my-site/trees.json";
   ```

2. Set the camera centre and pan limits from Part 3 (`[longitude, latitude]` and `[west, south, east, north]`):

   ```ts
   export const sampleCenter: Coordinate = [-76.485, 42.448];
   export const sampleBounds: LngLatBounds = [
     -76.487, 42.4466, -76.483, 42.4494,
   ];
   ```

3. Replace the hand-drawn `ground`, `sitePaths`, and `siteTrees` objects with your data:

   ```ts
   const ground = groundData as FeatureCollection;
   export const sitePaths = pathsData as FeatureCollection;
   export const siteTrees = treesData as FeatureCollection;
   ```

4. Replace the three entries in `siteZones` with your zones: `id`, `label`, `centre`, `west`, `south`, `east`, `north`. The practice package uses only the **first** zone, so make the first one cover the area you will test in.
5. **Do not change** `siteId: "sample-garden"` in `mobile/src/packages/bundled.ts`. Changing it makes the API reject every upload.
6. Run the checks:

   ```bash
   pnpm mobile:check
   ```

7. Reload the app. This is a JavaScript-only change, so reloading Metro is enough when a development build is already installed:

   ```bash
   pnpm mobile:simulator
   ```

   Press `r` in the Metro terminal to reload. If no development build is installed yet, follow the build steps in [the mobile README](../mobile/README.md#run).

The map allows zoom 15.5 to 21 and cannot pan outside `sampleBounds`. If the map opens blank or locked, `sampleBounds` does not contain `sampleCenter` or your first zone's centre.

---

## Part 5: Collect points and see them in QGIS

### Collect

1. Start the API against hosted Supabase: `pnpm api:hosted:up` (see [Supabase setup](Supabase-Setup.md)).
2. In the app, sign in, open **Sample garden practice**, arm **Place a point**, tap your site, and fill in the three practice fields.
3. Save. With the app open and online, the record moves to **synced** on its own. The Records screen shows its status.

### View on top of the base map

1. Open your QGIS project from Part 1 (the one with the base map).
2. Add the live observation layer: **Layer → Add Layer → Add PostgreSQL Layers…**, connect with service `fieldmaps_training`, turn off **Only look in public**, open schema `gis`, add `sample_observations`, and choose `fid` as the key. Full connection details and the password rules are in [the QGIS README](../qgis/README.md).
3. Drag the observation layer above the base map in the **Layers** panel.
4. After each new upload, right-click the layer → **Refresh** (or press **F5**). QGIS does not refresh on its own.

QGIS reprojects the EPSG:4326 points onto the EPSG:3857 base map automatically.

### Known snags in the current `qgis/` folder

- **The new database starts empty.** `pg_service.conf` points at the DECA Mark GIS project, provisioned September 22, 2026. The layer shows points only after the app uploads to it; the QGIS password is read from the `fieldmaps_qgis_secrets` volume as described in [the QGIS README](../qgis/README.md).
- **The saved project file is missing.** `open-training.command` opens `qgis/fieldmaps-training.qgs`, which is not in the folder; only an older backup, `fieldops-training.qgs~`, is there. Use the manual layer steps above, then save your own project. The launcher still works for setting `PGSERVICEFILE` if you point it at your project.

---

## Troubleshooting

| What you see                                     | Cause                                                             | Fix                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------- | --------------------------------------------------------------------- |
| Shapes appear in the ocean off Africa            | Exported in a projected CRS, not EPSG:4326                        | Re-export with CRS **EPSG:4326**                                      |
| Site outline missing, paths and trees visible    | `ground` features lack `kind = site` / `kind = structure`         | Fill in the `kind` field and re-export                                |
| `Unable to resolve module ./sites/.../x.geojson` | Metro does not import `.geojson`                                  | Rename the file to `.json`                                            |
| TypeScript error on the imported JSON            | JSON imports have a loose type                                    | Keep the `as FeatureCollection` cast from Part 4                      |
| Record stays on the device, never syncs          | Collected on Riverside (`janet-test-v1`), or `siteId` was changed | Collect on **Sample garden practice**; keep `siteId: "sample-garden"` |
| Record shows "needs attention"                   | API rejected it or is not running                                 | Check `pnpm api:hosted:up`, then retry from the Account screen        |
| QGIS certificate / SSL error                     | `sslrootcert` in `pg_service.conf` does not match this checkout   | Point it at `backend/certs/supabase-root-2021.crt` in your checkout   |
| New point missing in QGIS                        | Layer not refreshed                                               | Right-click the layer → **Refresh**                                   |

## Not supported yet

- Satellite imagery or raster tiles on the phone. Offline imagery needs a packaged tile format (MBTiles or PMTiles), licensing that allows offline use, and code in `mobile/src/maps/` to load it.
- Downloading a prepared package onto a device. The server prepares, versions and serves one; the collector has not been switched from its bundled geometry to fetching one, and delivery is still stubbed behind `PackageProvider` in `mobile/src/packages/site-package.ts`.
- Reading a `.qgz` project's layer geometry. The uploaded project file is read for its title, CRS and layer sources, which is what the imagery-licence and coordinate checks need; the features themselves come from the GeoJSON layers you upload beside it.
- Editing observations in QGIS and sending changes back to devices.
