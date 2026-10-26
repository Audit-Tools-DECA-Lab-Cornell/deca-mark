import importlib.util
import json
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.mark.parametrize(
    ("cleanup_failure", "resources_removed"),
    [
        (None, True),
        ("absent_auth", True),
        ("absent_db", True),
        ("auth_stop", False),
        ("db_stop", False),
        ("network_remove", False),
        ("all_cleanup", False),
        ("docker_missing", False),
        ("docker_timeout", False),
    ],
)
def test_cleanup_and_report_when_startup_fails(
    tmp_path: Path, cleanup_failure: str | None, resources_removed: bool
) -> None:
    # Given: Auth startup fails after both disposable containers have been owned.
    script = Path(__file__).with_name("isolated_auth_http.py")
    spec = importlib.util.spec_from_file_location("isolated_auth_http", script)
    assert spec is not None and spec.loader is not None
    harness = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(harness)
    output = tmp_path / "reports" / "result.json"
    actions: list[str] = []

    def docker(*parts: str) -> subprocess.CompletedProcess[str]:
        if parts[:2] == ("network", "create"):
            return subprocess.CompletedProcess(parts, 0, "network-id", "")
        if parts[0] == "inspect":
            if parts[1].startswith("decamark-auth-"):
                return subprocess.CompletedProcess(parts, 1, "", "Auth startup failed")
            return subprocess.CompletedProcess(
                parts,
                0,
                json.dumps(
                    [
                        {
                            "NetworkSettings": {
                                "Networks": {
                                    network: {"IPAddress": "172.20.0.2"}
                                    for network in networks
                                }
                            }
                        }
                    ]
                ),
                "",
            )
        if parts[0] == "exec" and parts[2] == "pg_isready":
            return subprocess.CompletedProcess(parts, 0, "accepting connections", "")
        if parts[0] == "stop":
            target = "auth" if parts[1].startswith("decamark-auth-") else "db"
            actions.append(target)
            if cleanup_failure == f"absent_{target}":
                return subprocess.CompletedProcess(
                    parts,
                    1,
                    "",
                    f"Error response from daemon: No such container: {parts[1]}",
                )
            if target == "auth" and cleanup_failure == "docker_missing":
                raise FileNotFoundError("docker executable unavailable during cleanup")
            if target == "auth" and cleanup_failure == "docker_timeout":
                raise subprocess.TimeoutExpired(parts, 1)
            if cleanup_failure in (f"{target}_stop", "all_cleanup"):
                return subprocess.CompletedProcess(parts, 1, "", "permission denied")
        if parts[:2] == ("network", "rm"):
            actions.append("network")
            if cleanup_failure in ("network_remove", "all_cleanup"):
                return subprocess.CompletedProcess(
                    parts, 1, "", "network has active endpoints"
                )
        return subprocess.CompletedProcess(parts, 0, "", "")

    networks: list[str] = []

    def run_docker(
        parts: tuple[str, ...], **_kwargs: str | bool | None
    ) -> subprocess.CompletedProcess[str]:
        assert parts[0] == "docker", "test must not launch other processes"
        if parts[1:3] == ("network", "create"):
            networks.append(parts[-1])
        return docker(*parts[1:])

    # When: startup raises, followed by a successful, absent, or failing cleanup.
    with (
        patch.object(sys, "argv", [str(script), "--output", str(output)]),
        patch.object(subprocess, "check_output", return_value="test-head"),
        patch.object(subprocess, "run", side_effect=run_docker),
        pytest.raises(RuntimeError, match="Auth startup failed"),
    ):
        harness.run()

    # Then: every cleanup action runs, the original error survives, and a report exists.
    assert actions == ["auth", "db", "network"]
    report = json.loads(output.read_text())
    assert report["status"] == "failed"
    assert report["task_resources_removed"] is resources_removed
    assert bool(report["cleanup_errors"]) is not resources_removed
    if cleanup_failure == "all_cleanup":
        assert len(report["cleanup_errors"]) == 3
