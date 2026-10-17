"""MOB-29 real mobile outbox against an isolated current-contract HTTP API."""

import json
import shutil
import subprocess
from io import BytesIO
from pathlib import Path
from uuid import uuid4
from zipfile import ZipFile

import pytest
from fieldmaps_api.observation_analysis_schemas import HistoricalObservationDetail
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.local_database import disposable_database_selected
from tests.package_fixtures import submission
from tests.signing import ISSUER, Signer, make_signer
from tests.test_zone_api_live import LiveApi
from tests.test_zone_form_succession import published_form
from tests.zone_api_fixtures import ZoneSite, document

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_zone_api_live",)
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def signer() -> Signer:
    return make_signer()


def test_mobile_bound_outbox_restart_publication_replay_and_inventory(
    live_api: LiveApi, tmp_path: Path,
) -> None:
    # Given: a real current package with play and inventory bindings on an isolated API.
    assert disposable_database_selected(), "MOB-29 requires the isolated API rehearsal"
    node = shutil.which("node")
    assert node, "A Node runtime with node:sqlite is required"
    tenant = live_api.tenant
    project = f"/v1/projects/{tenant.project}"
    site = ZoneSite(tenant, uuid4())
    with live_api.client() as manager:
        definition = document((ROOT / "contracts/forms/shell-v1.json").read_bytes())
        definition["status"] = "draft"
        created = manager.post(
            f"{project}/forms",
            json={
                "code": "synthetic-mob29-play",
                "name": "Synthetic MOB-29 play",
                "definition": definition,
            },
        )
        assert created.status_code == 201, created.text
        play_form = str(document(created.content)["code"])
        published = manager.post(
            f"{project}/form-versions/{play_form}/publish",
            headers={"If-Match": str(document(created.content)["etag"])},
        )
        assert published.status_code == 200, published.text
        inventory_form = published_form(manager, site, "synthetic-mob29-inventory")
        response = manager.post(
            f"{project}/packages",
            json=submission(
                site_id=str(tenant.site),
                form_version=play_form,
                inventory_form_version=inventory_form,
            ),
        )
        assert response.status_code == 201, response.text
        package = Publication.model_validate_json(response.content).package
        zones_response = manager.get(
            f"{project}/sites/{tenant.site}/zones",
            params={"package_id": str(package.package_id)},
        )
        assert zones_response.status_code == 200, zones_response.text
        zone = HistoricalZones.model_validate_json(zones_response.content).zones[0]
    point_id, inventory_id = str(uuid4()), str(uuid4())
    fixture = {
        "scope": {
            "apiUrl": live_api.url,
            "issuer": ISSUER,
            "userId": str(tenant.users["observer"]),
            "projectId": str(tenant.project),
        },
        "token": live_api.signer.issue(tenant.users["observer"]),
        "managerToken": live_api.signer.issue(tenant.users["manager"]),
        "siteId": str(tenant.site),
        "packageId": str(package.package_id),
        "zoneId": str(zone.zone_id),
        "formVersion": play_form,
        "inventoryFormVersion": inventory_form,
        "pointId": point_id,
        "inventoryId": inventory_id,
    }
    # When: the actual TypeScript collector installs, saves, restarts and uploads old-map work.
    result = subprocess.run(
        [
            node,
            str(ROOT / "mobile/node_modules/vitest/vitest.mjs"),
            "run",
            "src/sync/bound-upload-api.acceptance.test.ts",
        ],
        cwd=ROOT / "mobile",
        env={"MOB29_BOUND_API_FIXTURE": json.dumps(fixture)},
        capture_output=True,
        text=True,
        timeout=150,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    print(result.stdout)
    # Then: independent HTTP readback and export retain v1 and whole-zone Inventory.
    with live_api.client("observer") as observer:
        point = observer.get(f"{project}/observations/{point_id}")
        inventory = observer.get(f"{project}/observations/{inventory_id}")
        assert point.status_code == inventory.status_code == 200
        for response in (point, inventory):
            body = HistoricalObservationDetail.model_validate_json(response.content)
            assert str(body.package_id) == str(package.package_id)
            assert str(body.zone_id) == str(zone.zone_id)
        assert HistoricalObservationDetail.model_validate_json(inventory.content).geometry is None
        exported = observer.get(f"{project}/observations/export", params={"format": "geojson"})
        assert exported.status_code == 200, exported.text
        artifact = tmp_path / "live-export"
        artifact.mkdir(parents=True, exist_ok=True)
        with ZipFile(BytesIO(exported.content)) as archive:
            for name in (
                "observations.geojson",
                "historical-zones.geojson",
                "metadata.json",
            ):
                (artifact / name).write_bytes(archive.read(name))
    print(
        "PASS live HTTP: exact old-map point and Inventory readback/export; "
        "generated tokens not saved"
    )
