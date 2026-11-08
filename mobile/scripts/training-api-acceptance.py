"""MOB-43: the real collector code against a real API, for a fresh account and Training.

Not collected by any suite. Run it against a disposable database with the rehearsal runner:

    DECAMARK_REHEARSAL_IMAGE=<postgres image> sh database/zone-api-rehearsal.sh \
        -c pyproject.toml "$PWD/mobile/scripts/training-api-acceptance.py"

The runner builds every migration (DB-20's Training seed included) into a throwaway Postgres
and runs this file with the backend's pytest. It starts the API on a loopback port, signs a new
account in, and runs `mobile/src/packages/hosted/training-api.acceptance.test.ts` with that
account. The account joins Training, downloads the Practice garden, collects in the Standard,
Reliability and Inventory rounds and uploads them. This file then reads the three rows back
from the database.
"""

# ruff: noqa: S101, INP001  (a pytest file outside backend/tests: asserts and no package)
import json
import shutil
import socket
import subprocess
from collections.abc import Iterator
from pathlib import Path
from threading import Thread
from typing import Final
from uuid import UUID, uuid4

import pytest
import uvicorn
from pydantic import TypeAdapter

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.main import create_app
from tests.local_database import admin_sql, database_settings, disposable_database_selected
from tests.signing import ISSUER, Signer, make_signer
from tests.test_zone_api_live import ReadyServer

pytestmark = pytest.mark.integration
ROOT: Final = Path(__file__).resolve().parents[2]
TRAINING: Final = UUID("10000000-0000-4000-8000-000000000102")
SITE: Final = UUID("10000000-0000-4000-8000-000000000103")


@pytest.fixture
def signer() -> Signer:
    return make_signer()


@pytest.fixture
def api_url(signer: Signer) -> Iterator[str]:
    app = create_app(database_settings(), JwksVerifier(ISSUER, "authenticated", signer))
    server = ReadyServer(uvicorn.Config(app, host="127.0.0.1", port=0, log_level="error"))
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(128)
        address = TypeAdapter(tuple[str, int]).validate_python(listener.getsockname())
        runner = Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
        runner.start()
        try:
            assert server.ready.wait(timeout=10), "Loopback Uvicorn failed to start"
            yield f"http://127.0.0.1:{address[1]}"
        finally:
            server.should_exit = True
            runner.join(timeout=10)


def test_fresh_account_collects_three_rounds_in_training_and_uploads_them(
    api_url: str, signer: Signer
) -> None:
    assert disposable_database_selected(), "Run this through database/zone-api-rehearsal.sh"
    node = shutil.which("node")
    assert node, "A Node runtime with node:sqlite is required"
    user = uuid4()
    admin_sql(
        "INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES "
        "(:'user', '00000000-0000-0000-0000-000000000000', 'authenticated', "
        "'authenticated', :'user' || '@test.invalid');",
        f"user={user}",
    )
    fixture = {
        "scope": {
            "apiUrl": api_url,
            "issuer": ISSUER,
            "userId": str(user),
            "projectId": str(TRAINING),
        },
        "token": signer.issue(user),
    }
    # Repository Vitest, argv only, synthetic loopback fixture.
    result = subprocess.run(  # noqa: S603
        [
            node,
            str(ROOT / "mobile/node_modules/vitest/vitest.mjs"),
            "run",
            "src/packages/hosted/training-api.acceptance.test.ts",
        ],
        cwd=ROOT / "mobile",
        env={"MOB43_TRAINING_API_FIXTURE": json.dumps(fixture)},
        capture_output=True,
        text=True,
        timeout=150,
        check=False,
    )
    print(result.stdout)  # noqa: T201 - acceptance evidence; the token is never printed
    assert result.returncode == 0, result.stdout + result.stderr
    stored = admin_sql(
        "SELECT round_type || ':' || placement_source FROM fieldmaps.observations "
        "WHERE project_id = :'project' AND site_id = :'site' AND created_by = :'user' "
        "ORDER BY round_type;",
        f"project={TRAINING}",
        f"site={SITE}",
        f"user={user}",
    )
    assert stored.splitlines() == ["inventory:zone", "reliability:hand", "standard:hand"]
