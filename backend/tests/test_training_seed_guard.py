"""DB-20 refuses a database that still holds a fields-only form (isolated containers only)."""

import itertools
import os
import subprocess
import time
from collections.abc import Iterator
from pathlib import Path
from shutil import which

import pytest

from fieldmaps_api.form_schema_upgrade import psql

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20261028090000_training_seed_and_form_templates.sql"
pytestmark = pytest.mark.integration
_SEQUENCE = itertools.count(1)


def docker(*args: str) -> str:
    executable = which("docker")
    if executable is None:
        message = "Docker executable is required for the isolated rehearsal"
        raise FileNotFoundError(message)
    result = subprocess.run(  # noqa: S603 - test-owned literals and container IDs
        [executable, *args], check=True, capture_output=True, text=True, timeout=120
    )
    return result.stdout.strip()


@pytest.fixture
def before_seed() -> Iterator[str]:
    """Start a new container holding every migration before DB-20; no stack, port or volume."""
    container = f"decamark-schema2-{os.getpid()}{next(_SEQUENCE):04d}9"
    identity = docker(
        "run", "--rm", "--pull", "never", "-d", "--name", container, "--user", "postgres",
        "--tmpfs", "/tmp",  # noqa: S108 - socket inside a new, isolated test container
        "--entrypoint", "sh",
        os.getenv("DECAMARK_REHEARSAL_IMAGE", "public.ecr.aws/supabase/postgres:17.6.1.171"),
        "-c",
        "initdb -D /tmp/seed-db -A trust >/tmp/init.log && "
        "exec postgres -D /tmp/seed-db -c shared_preload_libraries=pg_cron "
        "-c cron.database_name=postgres -c listen_addresses= -k /tmp",
    )  # fmt: skip
    try:
        for attempt in range(30):
            try:
                psql(container, "SELECT 1;")
                break
            except subprocess.CalledProcessError:
                if attempt == 29:
                    raise
                time.sleep(1)
        psql(container, (ROOT / "database/tests/zone-bootstrap.sql").read_text())
        for path in sorted((ROOT / "supabase/migrations").glob("*.sql")):
            if path == MIGRATION:
                break
            psql(container, path.read_text())
        yield container
    finally:
        docker("stop", identity)


STATE = """SELECT jsonb_build_object(
 'forms',(SELECT jsonb_agg(code ORDER BY code) FROM fieldmaps.form_versions),
 'templates',to_regclass('fieldmaps.form_templates') IS NOT NULL,
 'packages',(SELECT count(*) FROM fieldmaps.site_packages));"""


def test_migration_refuses_a_fields_only_form_and_changes_nothing(before_seed: str) -> None:
    # Given a database that still holds a hosted-style fields-only form version
    psql(
        before_seed,
        "ALTER TABLE fieldmaps.form_versions DISABLE TRIGGER immutable_form_version;"
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition,form_id,"
        "version,state,schema_version,published_at) SELECT '10000000-0000-4000-8000-0000000000f1',"
        "organization_id,project_id,'legacy-v1','{\"fields\":[]}',form_id,2,'published',2,now() "
        "FROM fieldmaps.form_versions WHERE id='10000000-0000-4000-8000-000000000004';"
        "ALTER TABLE fieldmaps.form_versions ENABLE TRIGGER immutable_form_version;",
    )
    before = psql(before_seed, STATE)
    # When the migration runs, it refuses and names OPS-19
    with pytest.raises(subprocess.CalledProcessError) as refused:
        psql(before_seed, "BEGIN;" + MIGRATION.read_text() + "COMMIT;")
    assert "OPS-19" in str(refused.value.stderr)  # pyright: ignore[reportAny]
    # Then nothing was deleted, seeded or created
    assert psql(before_seed, STATE) == before


def test_migration_builds_on_the_untouched_chain(before_seed: str) -> None:
    psql(before_seed, "BEGIN;" + MIGRATION.read_text() + "COMMIT;")
    assert psql(before_seed, "SELECT count(*) FROM fieldmaps.form_templates;") == "2"
