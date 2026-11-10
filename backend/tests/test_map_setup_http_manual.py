import json
import socket
import subprocess
import threading
from pathlib import Path
from typing import Final, override
from uuid import uuid4

import pytest
import uvicorn
from pydantic import TypeAdapter

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.main import create_app
from fieldmaps_api.map_setup_schemas import MapSetup
from tests.local_database import database_settings
from tests.map_setup_fixtures import qgz_request
from tests.signing import ISSUER, Signer
from tests.tenant_fixtures import Tenant

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.test_map_setup_api",)
EVIDENCE: Final = Path(__file__).resolve().parents[2] / ".omo/start-work/evidence/T3"


class ReadyServer(uvicorn.Server):
    ready: threading.Event

    def __init__(self, config: uvicorn.Config, ready: threading.Event) -> None:
        super().__init__(config)
        self.ready = ready

    @override
    async def startup(self, sockets: list[socket.socket] | None = None) -> None:
        await super().startup(sockets)
        self.ready.set()


def test_live_curl_import_get_and_validation_artifact(signer: Signer, setup_site: Tenant) -> None:
    # Given the real API on an isolated loopback socket and disposable restricted database.
    ready = threading.Event()
    app = create_app(database_settings(), JwksVerifier(ISSUER, "authenticated", signer))
    listener = socket.socket()
    listener.bind(("127.0.0.1", 0))
    port = TypeAdapter(tuple[str, int]).validate_python(listener.getsockname())[1]
    server = ReadyServer(uvicorn.Config(app, log_level="warning"), ready)
    thread = threading.Thread(target=server.run, kwargs={"sockets": [listener]}, daemon=True)
    thread.start()
    token = signer.issue(setup_site.users["manager"])
    prefix = f"http://127.0.0.1:{port}/v1/projects/{setup_site.project}/sites/{setup_site.site}/map-setups"
    cleanup = {"port": port, "server_stopped": False, "socket_closed": False}
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    try:
        assert ready.wait(15), "API did not finish startup within 15 seconds"
        body = {
            **qgz_request("outline-no-zones").model_dump(mode="json"),
            "request_id": str(uuid4()),
            "expected_current_package_id": None,
        }
        # When literal curl drives import, readback and blocked publication validation.
        imported = subprocess.run(  # noqa: S603 - fixed curl executable, synthetic loopback URL, no shell.
            [
                "/usr/bin/curl",
                "-sS",
                "-i",
                "--max-time",
                "15",
                "-X",
                "POST",
                f"{prefix}/import",
                "-H",
                f"Authorization: Bearer {token}",
                "-H",
                "Content-Type: application/json",
                "--data-binary",
                "@-",
            ],
            input=json.dumps(body),
            text=True,
            capture_output=True,
            check=True,
        )
        status_headers, response_body = imported.stdout.split(
            "\r\n\r\n" if "\r\n" in imported.stdout else "\n\n", 1
        )
        assert "201 Created" in status_headers, imported.stdout
        setup = MapSetup.model_validate_json(response_body)
        etag = next(
            line.split(": ", 1)[1].strip()
            for line in status_headers.splitlines()
            if line.lower().startswith("etag:")
        )
        records.append(
            {
                "curl": "curl -i -X POST <loopback>/map-setups/import --data-binary @-",
                "status": 201,
                "layers": len(setup.layers),
                "zones": len(setup.content.zones),
                "etag": etag,
            }
        )
        loaded = subprocess.run(  # noqa: S603 - fixed curl executable, synthetic loopback URL, no shell.
            [
                "/usr/bin/curl",
                "-sS",
                "-i",
                "--max-time",
                "15",
                f"{prefix}/{setup.setup_id}",
                "-H",
                f"Authorization: Bearer {token}",
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        assert "200 OK" in loaded.stdout
        records.append(
            {"curl": "curl -i <loopback>/map-setups/<id>", "status": 200, "draft_reloaded": True}
        )
        validation = subprocess.run(  # noqa: S603 - fixed curl executable, synthetic loopback URL, no shell.
            [
                "/usr/bin/curl",
                "-sS",
                "-i",
                "--max-time",
                "15",
                "-X",
                "POST",
                f"{prefix}/{setup.setup_id}/validate",
                "-H",
                f"Authorization: Bearer {token}",
                "-H",
                f"If-Match: {etag}",
            ],
            text=True,
            capture_output=True,
            check=True,
        )
        # Then real HTTP reports a durable import and truthful incomplete-map blocker.
        assert "HTTP/1.1 422 " in validation.stdout, validation.stdout
        records.append(
            {
                "curl": "curl -i -X POST <loopback>/map-setups/<id>/validate -H If-Match:<etag>",
                "status": 422,
                "incomplete_blocked": True,
            }
        )
        (EVIDENCE / "manual-curl.json").write_text(json.dumps(records, indent=2))
    finally:
        server.should_exit = True
        thread.join(timeout=15)
        listener.close()
        cleanup["server_stopped"] = not thread.is_alive()
        cleanup["socket_closed"] = listener.fileno() == -1
        (EVIDENCE / "manual-curl-cleanup.json").write_text(json.dumps(cleanup, indent=2))
        assert not thread.is_alive(), "QA API server did not stop"
