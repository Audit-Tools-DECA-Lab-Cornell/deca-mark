# Importing a QGIS project for a DECA Mark site

The website converts uploaded vector sources into the GeoJSON layers used by a site's map package. Deploy the API and web changes together before using this on a hosted website.

## Website workflow

1. Open **Sites**, choose the site, and select **Set up map** or **Upload a new version**. An unfinished setup shows **Resume map setup**.
2. Choose a `.qgz`, `.qgs`, or ZIP containing the project and its data. Reading starts automatically. If source files are missing, add the named files and confirm the updated map. Separate geometry exports are optional.
3. Review how the imported features will be used. Confirm the site outline and observation zones, keep reference features, or deliberately leave unsupported sources out.
4. Use **Set boundaries** to draw or edit the site outline and zones. A project without zones can continue here. A project without any usable geographic features needs source data before drawing. Unfinished setups are saved privately; the status confirms when a save is acknowledged.
5. In **Review and publish**, choose a published observation form, check the map, and publish. Observers can download the published version. The previous version remains current until publication succeeds.

Reload restores the last confirmed save. Pending changes are not guaranteed to survive closing the browser. **Save and leave** waits for a confirmed save; conflicts preserve local work for comparison or download. A QGIS project is not always self-contained: its actual source datasets may still be needed.

## Why a project may need its source files

QGIS normally stores layer references in the project, while geometry stays in separate datasets. On the author's computer those references resolve to local files. The website has only the files selected for upload. A `.qgz` alone works when it contains supported source datasets; otherwise include those datasets. The `.qgd` auxiliary database is not a replacement for the project's vector sources. See the [QGIS file-format documentation](https://doc.qgis.org/3.44/en/docs/user_manual/appendices/qgis_file_formats.html).

The importer reads file-based OGR layers from GeoPackage, shapefile and GeoJSON. It respects the CRS assigned to each QGIS layer and converts coordinates to EPSG:4326. It preserves feature properties, using the dataset feature identifier when no `id` property exists. The setup asks which polygon is the site outline; other polygons may remain ground reference features. Imported outlines and zones are candidates for review, and missing boundaries can be drawn in the app.

Raster imagery and QGIS styles are not imported. Remote layers are not fetched. Filtered layers need a GeoJSON export of the filtered result. Missing or ambiguous source names are reported rather than guessed. Original project metadata stays attached, so preparation still reads the project's layers.

An online background map (an XYZ, WMS or other tile service) never becomes part of a package, and observers do not see it: they see the vector layers only. The upload leaves such a map out only after the manager confirms it (D35). The source review marks each one with its host. The API refuses a package whose project uses an online background map that the request has not named in `leave_out_online_basemaps`, answering `422 online_basemap_unconfirmed` with the layers and hosts, and publishes nothing. The same request sent again with those layer names publishes the vector layers, and the version records a warning check that names each map left out. A raster file the institution holds passes as before.

## Limits and verification

Selected files are capped at 64 files and 16 MB total. Archive expansion is bounded to 64 MB and 256 entries, with two archive levels (for example, a project-folder ZIP containing a QGZ). The converter handles at most 64 layers and 20,000 features per layer, with a 45-second deadline. Include only the site project and vector data; omit raster files to stay under the limit.

Local validation on October 10, 2026 passed 53 backend checks covering QGZ-contained data, GeoPackage and shapefile reprojection, QGIS CRS assignments, missing/remote/ambiguous sources, filtered layers, unsafe archives, XML entities, manager authorization and database-backed package preparation. The web unit suite passed 240 checks; web and mobile type checks and the scoped lint checks passed.

Full website acceptance used the real Next.js application, local Supabase Auth, authenticated API and local database with synthetic test accounts. All 14 browser checks passed in installed Chrome: eight account sign-in setup checks and three package workflows at both desktop (1440 px) and phone (390 px) widths. They verified existing GeoJSON uploads, a self-contained QGZ becoming the selected site's current map without separate GeoJSON, and missing sources followed by optional GeoJSON. Reading the project did not save a package; the separate upload did. No hosted migration, deployment or production verification was performed.
