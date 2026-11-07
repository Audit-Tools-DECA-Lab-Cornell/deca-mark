# Importing a QGIS project for a DECA Mark site

The website converts uploaded vector sources into the GeoJSON layers used by a site's map package. Deploy the API and web changes together before using this on a hosted website.

## Website workflow

1. Open **Sites**, choose the site, and select **Upload a new version**.
2. Choose the `.qgz` or `.qgs` project. Add any external GeoPackage or all shapefile parts (`.shp`, `.shx`, `.dbf`, `.prj`, and `.cpg` when present), or choose a ZIP containing the project folder.
3. Select **Read project**. Review any missing-source messages and the converted layers on the plan. Nothing has been saved at this point.
4. Assign unmatched layers to ground, zones, paths or trees. GeoJSON exports are optional: include them with the project or use the layer picker to replace converted geometry. Ground needs one site outline; zones need unique identifiers. Choose the published form version.
5. Select **Upload package**. The preparation checks determine whether the new version becomes this site's current map. A package that fails a check is refused with its reason and nothing is saved: the site keeps its current map, and no blocked version appears in its history.

## Why a project may need its source files

QGIS normally stores layer references in the project, while geometry stays in separate datasets. On the author's computer those references resolve to local files. The website has only the files selected for upload. A `.qgz` alone works when it contains supported source datasets; otherwise include those datasets. The `.qgd` auxiliary database is not a replacement for the project's vector sources. See the [QGIS file-format documentation](https://doc.qgis.org/3.44/en/docs/user_manual/appendices/qgis_file_formats.html).

The importer reads file-based OGR layers from GeoPackage, shapefile and GeoJSON. It respects the CRS assigned to each QGIS layer and converts coordinates to EPSG:4326. It preserves feature properties, using the dataset feature identifier when no `id` property exists. A single polygon assigned to ground without a `kind` value is marked as the site outline; multiple polygons require an explicitly marked outline.

Raster imagery and QGIS styles are not imported. Remote layers are not fetched. Filtered layers need a GeoJSON export of the filtered result. Missing or ambiguous source names are reported rather than guessed. Original project metadata stays attached, so preparation still reads the project's layers.

An online background map (an XYZ, WMS or other tile service) never becomes part of a package, and observers do not see it: they see the vector layers only. The upload leaves such a map out only after the manager confirms it (D35). **Read project** marks each one with its host. The API refuses a package whose project uses an online background map that the request has not named in `leave_out_online_basemaps`, answering `422 online_basemap_unconfirmed` with the layers and hosts, and publishes nothing. The same request sent again with those layer names publishes the vector layers, and the version records a warning check that names each map left out. A raster file the institution holds passes as before.

## Limits and verification

Selected files are capped at 64 files and 16 MB total. Archive expansion is bounded to 64 MB and 256 entries, with two archive levels (for example, a project-folder ZIP containing a QGZ). The converter handles at most 64 layers and 20,000 features per layer, with a 45-second deadline. Include only the site project and vector data; omit raster files to stay under the limit.

Local validation on October 10, 2026 passed 53 backend checks covering QGZ-contained data, GeoPackage and shapefile reprojection, QGIS CRS assignments, missing/remote/ambiguous sources, filtered layers, unsafe archives, XML entities, manager authorization and database-backed package preparation. The web unit suite passed 240 checks; web and mobile type checks and the scoped lint checks passed.

Full website acceptance used the real Next.js application, local Supabase Auth, authenticated API and local database with synthetic test accounts. All 14 browser checks passed in installed Chrome: eight account sign-in setup checks and three package workflows at both desktop (1440 px) and phone (390 px) widths. They verified existing GeoJSON uploads, a self-contained QGZ becoming the selected site's current map without separate GeoJSON, and missing sources followed by optional GeoJSON. Reading the project did not save a package; the separate upload did. No hosted migration, deployment or production verification was performed.
