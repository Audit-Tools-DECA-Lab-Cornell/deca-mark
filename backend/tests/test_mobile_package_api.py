"""MOB-28 installs actual current server packages through disposable loopback FastAPI."""

import json
import os
import shutil
import subprocess
from pathlib import Path
from uuid import uuid4

import pytest
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.zone_response_schemas import Draft, Publication
from tests.conftest import signer
from tests.local_database import admin_sql, disposable_database_selected
from tests.package_fixtures import submission
from tests.signing import ISSUER
from tests.test_zone_api_live import LiveApi, live_api
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration
__all__ = ["live_api", "signer"]


def test_current_mobile_package_survives_restart(live_api: LiveApi) -> None:
    assert disposable_database_selected(), "MOB-28 requires the isolated API rehearsal"
    pnpm = shutil.which("pnpm")
    assert pnpm, "Node 24 and pnpm must be on PATH"
    with live_api.client() as client:
        schema = client.get("/openapi.json")
        assert schema.status_code == 200, schema.text
        paths = TypeAdapter(dict[str, JsonValue]).validate_python(document(schema.content)["paths"])
        assert not any(path.startswith("/v2/") for path in paths), (
            "BE-22 and DB-19 must supply the single-contract backend before MOB-28 API acceptance"
        )
    tenant = live_api.tenant
    project = f"/v1/projects/{tenant.project}"
    definition = document(
        (Path(__file__).resolve().parents[2] / "contracts/forms/janet-test-v1.json").read_bytes()
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
            f"{project}/packages",
            json=submission(site_id=str(tenant.site), form_version="janet-test-v1"),
        )
        assert package.status_code == 201, package.text
        base = str(Publication.model_validate_json(package.content).package.package_id)
        url = f"{project}/sites/{tenant.site}/zone-drafts"
        draft = manager.post(url, json={"request_id": str(uuid4()), "base_package_id": base})
        assert draft.status_code == 201, draft.text
        published = manager.post(
            f"{url}/{Draft.model_validate_json(draft.content).draft_id}/publish",
            headers={"If-Match": draft.headers["etag"]},
            json={"request_id": str(uuid4()), "expected_current_package_id": base},
        )
        assert published.status_code == 201, published.text
        bound_package = Publication.model_validate_json(published.content).package
    fixture = {
        "bound": {
            "scope": {
                "apiUrl": live_api.url,
                "issuer": ISSUER,
                "userId": str(tenant.users["observer"]),
                "projectId": str(tenant.project),
            },
            "token": live_api.signer.issue(tenant.users["observer"]),
            "packageId": str(bound_package.package_id),
            "formVersionId": str(form),
            "siteId": str(tenant.site),
        },
    }
    result = subprocess.run(  # noqa: S603 - repository Vitest, argv only, synthetic loopback fixture
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
    print(result.stdout)  # noqa: T201 - actual SQLite/HTTP acceptance evidence; no tokens
