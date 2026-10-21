"""Throwaway, internal-network Auth HTTP acceptance; never loads deployed config."""

import argparse
import contextlib
import hashlib
import http.client
import json
import os
from pathlib import Path
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from uuid import uuid4

import jwt

ROOT = next(
    parent
    for parent in Path(__file__).resolve().parents
    if (parent / "backend/pyproject.toml").is_file()
)
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend/src"))


def child():
    """Launch the real application/lifespan, with only local test identity material."""
    import anyio
    import uvicorn
    from fieldmaps_api.auth import JwksVerifier
    from fieldmaps_api.config import Settings
    from fieldmaps_api.main import create_app
    from pydantic import SecretStr
    from unittest.mock import patch

    values = json.loads(sys.stdin.readline())
    settings = Settings(**values["settings"])

    class LocalKey:
        def get_signing_key_from_jwt(self, _token):
            return jwt.PyJWK(values["jwk"])

    async def key(_settings):
        return SecretStr(values["test_key"])

    async def post_commit_pause(*_args, **_kwargs):
        print("isolated_post_commit_before_provider", flush=True)
        await anyio.sleep_forever()

    with contextlib.ExitStack() as stack:
        stack.enter_context(patch("fieldmaps_api.routers.identity.admin_key", key))
        stack.enter_context(
            patch("fieldmaps_api.account_deletion_worker.admin_key", key)
        )
        if values["interrupt"]:
            stack.enter_context(
                patch("fieldmaps_api.routers.identity.reconcile_one", post_commit_pause)
            )
        app = create_app(
            settings,
            JwksVerifier(str(settings.issuer).rstrip("/"), "authenticated", LocalKey()),
        )
        uvicorn.run(
            app,
            host="127.0.0.1",
            port=values["port"],
            log_level="info",
            access_log=False,
        )


def run():
    import httpx2 as requests
    from tests.signing import make_signer

    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = {
        "status": "running",
        "source": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip(),
        "cases": [],
    }
    suffix = f"{os.getpid()}-{secrets.token_hex(3)}"
    network = f"decamark-auth-acceptance-{suffix}"
    db = f"fieldmaps-zone-api-{os.getpid()}"
    auth = f"decamark-auth-{suffix}"
    api = None
    gateway = None
    owned = []
    local_secret = secrets.token_urlsafe(48)
    fake_key = "sb_secret_" + secrets.token_urlsafe(24)
    admin_token = jwt.encode(
        {
            "role": "service_role",
            "aud": "authenticated",
            "exp": int(time.time()) + 3600,
        },
        local_secret,
        algorithm="HS256",
    )
    mode = "normal"
    calls = []
    allowed = set()
    logs = []

    def command(*parts, input=None):
        result = subprocess.run(parts, input=input, text=True, capture_output=True)
        if result.returncode:
            # Docker output is safe for these public images/SQL, never display argv/env.
            raise RuntimeError(f"isolated command failed: {result.stderr[-1800:]}")
        return result.stdout.strip()

    def sql(query):
        return command(
            "docker",
            "exec",
            "-i",
            db,
            "psql",
            "-h",
            "/tmp",
            "-XAt",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-v",
            "ON_ERROR_STOP=1",
            input=query,
        )

    def wait_for(check, seconds=15):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            try:
                if check():
                    return
            except (requests.RequestError, RuntimeError):
                pass
            time.sleep(0.1)
        assert check(), "isolated acceptance deadline"

    def request(method, url, **kwargs):
        with requests.Client(trust_env=False) as session:
            return session.request(method, url, timeout=10, **kwargs)

    def free_port():
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]

    def exists(user):
        return sql(f"SELECT EXISTS(SELECT 1 FROM auth.users WHERE id='{user}');") == "t"

    def job(user):
        raw = sql(
            f"SELECT jsonb_build_object('attempts',attempts,'error',last_error,'deferred',next_attempt_at>now(),'leased',lease_token IS NOT NULL) FROM fieldmaps_private.account_deletions WHERE user_id='{user}';"
        )
        return json.loads(raw) if raw else None

    def research():
        return sql(
            "SELECT jsonb_build_object('observations',(SELECT coalesce(jsonb_agg(to_jsonb(o) ORDER BY id),'[]') FROM fieldmaps.observations o),'forms',(SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM fieldmaps.form_versions f),'packages',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM fieldmaps.site_packages p));"
        )

    def create_user():
        user = str(uuid4())
        response = request(
            "POST",
            f"{auth_url}/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "id": user,
                "email": f"local-{user}@example.invalid",
                "password": secrets.token_urlsafe(30),
                "email_confirm": True,
            },
        )
        if response.status_code != 200:
            log_result = subprocess.run(
                ["docker", "logs", auth], text=True, capture_output=True
            )
            safe = (log_result.stdout + log_result.stderr)[-4000:]
            for value in (local_secret, admin_token, fake_key):
                safe = safe.replace(value, "[local-test-value]")
            print(safe, flush=True)
            print(
                {
                    "status": response.status_code,
                    "error_code": response.json().get("error_code"),
                },
                flush=True,
            )
        assert response.status_code == 200, (
            f"local Admin create status {response.status_code}"
        )
        assert response.json()["id"] == user
        allowed.add(user)
        return user

    def token(user):
        return jwt.encode(
            {
                "sub": user,
                "iss": issuer,
                "aud": "authenticated",
                "exp": int(time.time()) + 3600,
            },
            signer.private_key,
            algorithm="RS256",
            headers={"kid": "test"},
        )

    def start(interrupt=False):
        nonlocal api
        api = subprocess.Popen(
            [sys.executable, str(Path(__file__).resolve()), "--child"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env={
                k: v
                for k, v in os.environ.items()
                if k not in {"DECAMARK_CONFIG", "SENTRY_DSN"}
                and not k.startswith("EMAIL_")
            },
        )
        values = {
            "port": api_port,
            "interrupt": interrupt,
            "test_key": fake_key,
            "jwk": jwk,
            "settings": {
                "database_url": f"postgresql+asyncpg://fieldmaps_api@{db_host}:5432/postgres",
                "issuer": issuer,
                "jwks_url": f"{issuer}/.well-known/jwks.json",
                "auth_admin_key_file": "/synthetic-key-never-opened",
                "email_delivery_allowed": False,
            },
        }
        api.stdin.write(json.dumps(values) + "\n")
        api.stdin.close()

        def read_logs():
            for line in api.stdout:
                logs.append(line.strip())

        threading.Thread(target=read_logs, daemon=True).start()
        wait_for(lambda: request("GET", api_url + "/health").status_code == 200)

    def stop(kill=False):
        nonlocal api
        if api and api.poll() is None:
            api.send_signal(signal.SIGKILL if kill else signal.SIGTERM)
            api.wait(timeout=15)
        api = None

    try:
        command("docker", "network", "create", "--internal", network)
        command(
            "docker",
            "run",
            "--rm",
            "--pull",
            "never",
            "-d",
            "--name",
            db,
            "--user",
            "postgres",
            "--network",
            network,
            "--network-alias",
            "test-db",
            "--tmpfs",
            "/tmp",
            "--entrypoint",
            "sh",
            "decamark-cleanup-tests:local",
            "-c",
            'initdb -D /tmp/zone-db -A trust >/tmp/init.log && printf "host all all 0.0.0.0/0 trust\\n" >> /tmp/zone-db/pg_hba.conf && exec postgres -D /tmp/zone-db -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c listen_addresses=* -k /tmp',
        )
        owned.append(db)
        wait_for(
            lambda: command(
                "docker", "exec", db, "pg_isready", "-h", "/tmp", "-U", "postgres"
            ).endswith("accepting connections")
        )
        db_host = json.loads(command("docker", "inspect", db))[0]["NetworkSettings"][
            "Networks"
        ][network]["IPAddress"]
        sql(
            "CREATE SCHEMA extensions; CREATE SCHEMA auth; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin; CREATE ROLE supabase_admin SUPERUSER; REVOKE CREATE ON SCHEMA public FROM PUBLIC; ALTER ROLE postgres SET search_path TO auth, public, extensions;"
        )
        auth_env = {
            "GOTRUE_API_HOST": "0.0.0.0",
            "GOTRUE_API_PORT": "9999",
            "API_EXTERNAL_URL": "http://127.0.0.1/auth/v1",
            "GOTRUE_DB_DRIVER": "postgres",
            "GOTRUE_DB_DATABASE_URL": "postgres://postgres@test-db:5432/postgres?sslmode=disable",
            "GOTRUE_SITE_URL": "http://127.0.0.1:3000",
            "GOTRUE_DISABLE_SIGNUP": "false",
            "GOTRUE_JWT_ADMIN_ROLES": "service_role",
            "GOTRUE_JWT_AUD": "authenticated",
            "GOTRUE_JWT_DEFAULT_GROUP_NAME": "authenticated",
            "GOTRUE_JWT_EXP": "3600",
            "GOTRUE_JWT_SECRET": local_secret,
            "GOTRUE_EXTERNAL_EMAIL_ENABLED": "true",
            "GOTRUE_MAILER_AUTOCONFIRM": "true",
            "GOTRUE_SMTP_MAX_FREQUENCY": "1s",
        }
        env_args = [item for k, v in auth_env.items() for item in ("-e", f"{k}={v}")]
        command(
            "docker",
            "run",
            "--rm",
            "--pull",
            "never",
            "-d",
            "--name",
            auth,
            "--network",
            network,
            *env_args,
            "supabase/gotrue:v2.197.0",
        )
        owned.append(auth)
        auth_host = json.loads(command("docker", "inspect", auth))[0][
            "NetworkSettings"
        ]["Networks"][network]["IPAddress"]
        auth_url = f"http://{auth_host}:9999"
        try:
            wait_for(
                lambda: request("GET", auth_url + "/health").status_code == 200, 40
            )
        except Exception:
            print(command("docker", "logs", auth)[-3500:], flush=True)
            raise
        for migration in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            sql("BEGIN;\n" + migration.read_text() + "\nCOMMIT;")
        # This is exclusively the repository's public synthetic seed, on this fresh DB.
        sql((ROOT / "supabase/seed.sql").read_text())
        frozen = research()
        report["setup"] = {
            "network_internal": json.loads(
                command("docker", "network", "inspect", network)
            )[0]["Internal"],
            "database_image": command(
                "docker", "inspect", db, "--format", "{{.Image}}"
            ),
            "auth_image": command("docker", "inspect", auth, "--format", "{{.Image}}"),
            "database_version": sql("SELECT version();"),
            "postgis": sql("SELECT extensions.postgis_full_version();"),
            "migrations": [
                p.name for p in sorted((ROOT / "supabase/migrations").glob("*.sql"))
            ],
            "auth_health": request("GET", auth_url + "/health").json(),
            "db_container": db,
            "network": network,
            "api_gateway_loopback_only": True,
            "database_auth_host_ports_published": False,
            "user_verifier": "test RSA key; production JwksVerifier",
            "auth_admin_boundary": "actual GoTrue HTTP via local-only fault gateway; no MockTransport",
        }

        class Gateway(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_DELETE(self):
                user = self.path.rsplit("/", 1)[-1]
                if user not in allowed or self.headers.get("apikey") != fake_key:
                    self.send_error(403)
                    return
                if mode == "outage":
                    calls.append({"user": user, "fault": "503", "forwarded": False})
                    self.send_response(503)
                    self.end_headers()
                    return
                connection = http.client.HTTPConnection(auth_host, 9999, timeout=5)
                connection.request(
                    "DELETE",
                    f"/admin/users/{user}",
                    headers={
                        "Authorization": f"Bearer {admin_token}",
                        "X-Supabase-Api-Version": "2024-01-01",
                    },
                )
                response = connection.getresponse()
                body = response.read()
                record = {
                    "user": user,
                    "forwarded": True,
                    "upstream_status": response.status,
                }
                if response.status == 404:
                    record["code"] = json.loads(body).get("code") or json.loads(
                        body
                    ).get("error_code")
                calls.append(record)
                if mode == "lost_ack" and response.status == 200:
                    record["acknowledgement_dropped"] = True
                    self.close_connection = True
                    self.connection.shutdown(socket.SHUT_RDWR)
                    return
                self.send_response(response.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        gateway = ThreadingHTTPServer(("127.0.0.1", 0), Gateway)
        threading.Thread(target=gateway.serve_forever, daemon=True).start()
        issuer = f"http://127.0.0.1:{gateway.server_port}/auth/v1"
        api_port = free_port()
        api_url = f"http://127.0.0.1:{api_port}"
        signer = make_signer()
        jwk = signer.get_signing_key_from_jwt("")._jwk_data

        # Actual persisted 30-second backoff; no timestamp override.
        user = create_user()
        mode = "outage"
        start()
        headers = {"Authorization": f"Bearer {token(user)}"}
        assert request("GET", api_url + "/v1/me", headers=headers).status_code == 200
        response = request("DELETE", api_url + "/v1/me", headers=headers)
        assert response.status_code == 202 and response.json() == {"status": "pending"}
        pending = job(user)
        assert pending == {
            "attempts": 1,
            "error": "provider_unavailable",
            "deferred": True,
            "leased": False,
        }, pending
        assert request("GET", api_url + "/v1/me", headers=headers).status_code == 403
        assert (
            request(
                "PATCH",
                api_url + "/v1/me",
                headers=headers,
                json={"display_name": "Restore"},
            ).status_code
            == 403
        )
        assert exists(user)
        attempts = len(calls)
        stop(kill=True)
        start()
        assert job(user) == pending and len(calls) == attempts
        mode = "normal"
        print(
            "isolated outage: 202, revoked access, real process restart, persisted backoff; waiting for due time",
            flush=True,
        )
        began = time.monotonic()
        wait_for(lambda: not exists(user) and job(user) is None, 45)
        elapsed = round(time.monotonic() - began, 2)
        assert len(calls) == 3, calls
        stop()
        report["cases"].append(
            {
                "case": "outage_restart",
                "result": "passed",
                "delete_status": 202,
                "backoff_state": pending,
                "provider_calls": len(calls),
                "real_wait_seconds_after_restart": elapsed,
                "no_synthetic_clock": True,
                "without_another_user_request": True,
                "auth_absent": True,
                "job_absent": True,
                "access_denied_while_pending": True,
                "api_restart": "SIGKILL then new uvicorn/application lifespan",
            }
        )
        print("isolated outage/restart recovered through actual Auth HTTP", flush=True)

        # Instrument only the post-commit router boundary, then really kill the API.
        user = create_user()
        start(interrupt=True)
        headers = {"Authorization": f"Bearer {token(user)}"}
        assert request("GET", api_url + "/v1/me", headers=headers).status_code == 200
        request_error = []

        def interrupted_request():
            try:
                request("DELETE", api_url + "/v1/me", headers=headers)
            except requests.RequestError as error:
                request_error.append(type(error).__name__)

        worker = threading.Thread(target=interrupted_request, daemon=True)
        worker.start()
        wait_for(
            lambda: any(
                "isolated_post_commit_before_provider" in line for line in logs
            ),
            2,
        )
        interrupted_state = job(user)
        assert interrupted_state == {
            "attempts": 0,
            "error": None,
            "deferred": False,
            "leased": False,
        }, interrupted_state
        assert exists(user)
        stop(kill=True)
        worker.join(3)
        start()
        wait_for(lambda: not exists(user) and job(user) is None)
        stop()
        report["cases"].append(
            {
                "case": "kill_after_commit_before_provider",
                "result": "passed",
                "post_commit_state": interrupted_state,
                "actual_sigkill": True,
                "instrumentation": "isolated router reconcile hook pauses after transaction commit; no provider mocks",
                "restart_without_user_request": True,
                "auth_absent": True,
                "job_absent": True,
                "interrupted_client": request_error,
            }
        )
        print(
            "isolated post-commit SIGKILL recovered on real application startup",
            flush=True,
        )

        user = create_user()
        mode = "lost_ack"
        start()
        headers = {"Authorization": f"Bearer {token(user)}"}
        assert request("GET", api_url + "/v1/me", headers=headers).status_code == 200
        offset = len(calls)
        response = request("DELETE", api_url + "/v1/me", headers=headers)
        assert response.status_code == 204
        lost_calls = calls[offset:]
        assert (
            len(lost_calls) == 2
            and lost_calls[0]["upstream_status"] == 200
            and lost_calls[0]["acknowledgement_dropped"]
            and lost_calls[1]["upstream_status"] == 404
            and lost_calls[1]["code"] == "user_not_found"
        ), lost_calls
        assert not exists(user) and job(user) is None
        stop(kill=True)
        start()
        assert not exists(user) and job(user) is None
        assert len(calls) == offset + 2
        assert request("GET", api_url + "/v1/me", headers=headers).status_code == 403
        stop()
        report["cases"].append(
            {
                "case": "actual_provider_success_acknowledgement_lost",
                "result": "passed",
                "delete_status": 204,
                "upstream_statuses": [200, 404],
                "confirmed_absence_code": "user_not_found",
                "restart_duplicate_safe": True,
                "real_auth_cascade": True,
                "note": "actual Auth FK cascade removes the recovery row on successful deletion; bounded retry still confirms absence",
            }
        )
        assert research() == frozen
        report["research_unchanged_sha256"] = hashlib.sha256(
            frozen.encode()
        ).hexdigest()
        report["status"] = "passed"
        report["all_local_synthetic_auth_users_absent"] = all(
            not exists(user) for user in allowed
        )
        report["all_recovery_jobs_absent"] = (
            sql("SELECT count(*) FROM fieldmaps_private.account_deletions;") == "0"
        )
        print(
            "isolated actual-Auth HTTP acceptance: 3 cases passed; production untouched",
            flush=True,
        )
    finally:
        stop(kill=True)
        if gateway:
            gateway.shutdown()
        for container in reversed(owned):
            command("docker", "stop", container)
        if network:
            command("docker", "network", "rm", network)
        report["task_resources_removed"] = True
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    if "--child" in sys.argv:
        child()
    else:
        run()
