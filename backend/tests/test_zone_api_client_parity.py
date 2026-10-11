import base64
import json
import shutil
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import anyio
import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from fieldmaps_api.site_schemas import Site
from fieldmaps_api.zone_response_schemas import HistoricalZones, SiteV2
from tests.zone_api_fixtures import ZoneSite, document, publish_draft

pytestmark = pytest.mark.integration

CLIENT_PARSE = """
import { readFileSync } from 'node:fs';
import { manifestSchema, sitesSchema } from './src/packages/hosted/schemas.ts';
const example = JSON.parse(readFileSync(0, 'utf8'));
const sites = sitesSchema.parse(example.sites);
const manifest = manifestSchema.parse(example.manifest);
if (manifest.format !== 1 || sites[0].package.package_id !== example.legacy_id) {
  throw new Error('Legacy client discovered a managed package');
}
if (manifest.zones.map(zone => zone.id).join() !== sites[0].zones.map(zone => zone.id).join()) {
  throw new Error('Legacy site and archive disagree');
}
const { load } = await import('../web/tests/unit/support.mjs');
const { readPackageArchive } = await load('lib/sites/archive.ts');
const webPackage = readPackageArchive(new Uint8Array(Buffer.from(example.archive, 'base64')));
if (webPackage.manifest.format !== 1 || webPackage.manifest.site_code !== manifest.site_code) {
  throw new Error('Web and mobile legacy archive readers disagree');
}
"""


def test_actual_site_and_archive_bodies_parse_in_old_and_new_consumers(
    api_client: TestClient, zone_site: ZoneSite
) -> None:
    published = publish_draft(api_client, zone_site)
    v2 = TypeAdapter(list[SiteV2]).validate_json(
        api_client.get(f"/v2/projects/{zone_site.tenant.project}/sites").content
    )
    managed = next(site for site in v2 if site.site_id == zone_site.tenant.site)
    assert managed.package is not None
    assert str(managed.package.package_id) == published["package_id"]
    assert all(zone.zone_id is not None for zone in managed.zones)
    historical = HistoricalZones.model_validate_json(
        api_client.get(f"{zone_site.url}/zones?package_id={published['package_id']}").content
    )
    assert historical.zones
    legacy = TypeAdapter(list[Site]).validate_json(
        api_client.get(f"{zone_site.project_url}/sites").content
    )
    sites = [
        site.model_dump(mode="json") for site in legacy if site.site_id == zone_site.tenant.site
    ]
    archive = api_client.get(f"{zone_site.project_url}/packages/{zone_site.package_id}/archive")
    with ZipFile(BytesIO(archive.content)) as opened:
        manifest = document(opened.read("manifest.json"))
    node = shutil.which("node")
    assert node is not None
    mobile = Path(__file__).resolve().parents[2] / "mobile"

    async def runtime_parse() -> None:
        with anyio.fail_after(20):
            result = await anyio.run_process(
                [node, "--experimental-strip-types", "--input-type=module", "-e", CLIENT_PARSE],
                cwd=mobile,
                input=json.dumps(
                    {
                        "sites": sites,
                        "manifest": manifest,
                        "legacy_id": str(zone_site.package_id),
                        "archive": base64.b64encode(archive.content).decode(),
                    }
                ).encode(),
                check=False,
            )
        assert result.returncode == 0, result.stderr.decode()

    anyio.run(runtime_parse)
