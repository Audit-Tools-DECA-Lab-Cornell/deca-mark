import base64, io, json, sys, zipfile, subprocess, tempfile, pathlib
from uuid import UUID
sys.path.insert(0, "/home/user/deca-mark/backend/src")
sys.path.insert(0, "/home/user/deca-mark/backend/tests")
from test_zone_packages import source, forms  # synthetic helpers
from fieldmaps_api.domain.packages import PackageError, NO_PERMITTED_HOSTS, read_source_project, check_imagery_licence, ProjectFile
from fieldmaps_api.domain.zone_archive import prepare_import_base

qgs = ('<qgis><projectlayers><maplayer type="raster"><layername>ESRI World Imagery</layername>'
       '<provider>wms</provider><datasource>crs=EPSG:3857&amp;format&amp;type=xyz&amp;url=https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/%7Bz%7D/%7By%7D/%7Bx%7D</datasource>'
       '</maplayer></projectlayers></qgis>')
buf = io.BytesIO()
with zipfile.ZipFile(buf, "w") as z: z.writestr("site.qgs", qgs)
pf = {"file_name": "site.qgz", "content": base64.b64encode(buf.getvalue()).decode()}
base_req = source()
with_project = type(base_req).model_validate({**json.loads(base_req.model_dump_json()), "project_file": pf})
checks = []
project = read_source_project(ProjectFile.model_validate(pf), checks)
check_imagery_licence(project, NO_PERMITTED_HOSTS, checks)
print("BLOCKED DETAIL:", [c.detail for c in checks if c.state == "blocked"])
try:
    prepare_import_base(with_project, "NORTH", forms())
    print("with project: passed")
except PackageError as e:
    print("with project: PackageError ->", repr(str(e)))
b = prepare_import_base(base_req, "NORTH", forms())
print("without project: passed; imagery check:", [c.detail for c in b.checks if c.step == "imagery-licence"])
