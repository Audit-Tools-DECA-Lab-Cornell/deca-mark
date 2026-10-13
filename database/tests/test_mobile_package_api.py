"""MOB-28 installs actual current server packages through disposable loopback FastAPI."""

import json
import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from tests.conftest import signer
from tests.local_database import admin_sql, disposable_database_selected
from tests.signing import ISSUER
from tests.test_site_packages import submission
from tests.test_zone_api_live import LiveApi, live_api
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration
__all__ = ["live_api", "signer"]


def test_current_mobile_package_survives_restart(live_api: LiveApi) -> None:
    if not disposable_database_selected():
        raise RuntimeError("MOB-28 acceptance requires the disposable API rehearsal")
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise RuntimeError("Node 24 and pnpm must be on PATH")
    with live_api.client() as client:
        schema = client.get("/openapi.json")
        assert schema.status_code == 200, schema.text
        assert not any(path.startswith("/v2/") for path in schema.json()["paths"]), (
            "BE-22 and DB-19 must supply the single-contract backend before MOB-28 API acceptance"
        )
    tenant = live_api.tenant
    project = f"/v1/projects/{tenant.project}"
    definition = json.loads(
        (
            Path(__file__).resolve().parents[2] / "contracts/forms/janet-test-v1.json"
        ).read_text()
    )
    definition["status"] = "published"
    form = uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition) "
        "VALUES (:'new_form',:'org',:'project','janet-test-v1',:'definition'::jsonb);",
        *tenant.variables(),
        f"new_form={form}",
        f"definition={json.dumps(definition)}",
    )
    with live_api.client() as manager:
        package = manager.post(
            f"{project}/packages", json=submission(form_version="janet-test-v1")
        )
        assert package.status_code == 201, package.text
        base = document(package.content)["package_id"]
        url = f"{project}/sites/{tenant.site}/zone-drafts"
        draft = manager.post(
            url, json={"request_id": str(uuid4()), "base_package_id": base}
        )
        assert draft.status_code == 201, draft.text
        published = manager.post(
            f"{url}/{document(draft.content)['draft_id']}/publish",
            headers={"If-Match": draft.headers["etag"]},
            json={"request_id": str(uuid4()), "expected_current_package_id": base},
        )
        assert published.status_code == 201, published.text
        bound_package = document(published.content)["package"]
        assert isinstance(bound_package, dict)
    fixture = {
        "bound": {
            "scope": {
                "apiUrl": live_api.url,
                "issuer": ISSUER,
                "userId": str(tenant.users["observer"]),
                "projectId": str(tenant.project),
            },
            "token": live_api.signer.issue(tenant.users["observer"]),
            "packageId": bound_package["package_id"],
            "siteId": str(tenant.site),
        },
    }
    result = subprocess.run(
        [
            pnpm,
            "exec",
            "vitest",
            "run",
            "src/packages/hosted/bound-install-api.acceptance.test.ts",
        ],
        cwd=Path(__file__).resolve().parents[2] / "mobile",
        env={**os.environ, "MOB28_SINGLE_PATH_FIXTURE": json.dumps(fixture)},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    print(result.stdout)
