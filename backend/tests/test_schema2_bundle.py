"""Exercise the operator CLI without database connections or credential files."""

import json
import subprocess
from hashlib import sha256
from pathlib import Path
from uuid import UUID

import pytest
from pydantic import JsonValue

from fieldmaps_api.form_schema_preflight import PreflightRow
from tests.test_observation_analysis_domain import canonical, question

ROOT = Path(__file__).resolve().parents[2]


def cli(command: str, payload: str = "", *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(  # noqa: S603 - fixed local script, no shell evaluation
        ["/bin/sh", str(ROOT / "database/migrations.sh"), command, *args],
        input=payload,
        text=True,
        capture_output=True,
        check=False,
        timeout=15,
        cwd=ROOT,
    )


def snapshot(definition: dict[str, JsonValue], version: int = 1) -> str:
    row = PreflightRow(
        id=UUID(int=1), schema_version=version, definition_text=json.dumps(definition)
    )
    return json.dumps([row.model_dump(mode="json")])


def test_prepare_emits_one_bound_transaction_for_valid_snapshot() -> None:
    # Given a canonical schema1 snapshot, when preparing through the operator CLI.
    definition = canonical([question("value", "Old_Column")])
    result = cli("prepare", snapshot(definition))
    # Then SQL binds exact bytes and migration history within one transaction.
    assert result.returncode == 0, result.stderr
    transaction, history = result.stdout.split(
        "\nINSERT INTO supabase_migrations.schema_migrations", 1
    )
    assert transaction.count("\nBEGIN;\n") == 1
    assert "\nCOMMIT;" not in transaction
    assert history.endswith("\nCOMMIT;\n")
    assert sha256(json.dumps(definition).encode()).hexdigest() in result.stdout
    assert "set_config('fieldmaps.schema2_preflight'" in result.stdout
    assert "INSERT INTO supabase_migrations.schema_migrations" in result.stdout
    assert "Migration SHA256:" in result.stdout


@pytest.mark.parametrize(
    ("definition", "version"),
    [
        ({"fields": "invalid", "private_content": "DO_NOT_PRINT_THIS"}, 1),
        (canonical([question("value", "value")]) | {"columnNaming": "questionId"}, 1),
        (canonical([question("value", "value")]), 2),
    ],
)
def test_prepare_refuses_incompatible_forms_without_sql_or_contents(
    definition: dict[str, JsonValue], version: int
) -> None:
    # Given an incompatible stored form, when preparation is requested.
    result = cli("prepare", snapshot(definition, version))
    # Then no applicable SQL or private definition content is emitted.
    assert result.returncode == 2
    assert result.stdout == ""
    assert "Cannot prepare" in result.stderr
    assert "DO_NOT_PRINT_THIS" not in result.stderr


def test_prepare_refuses_malformed_snapshot_without_echoing_input() -> None:
    # Given malformed JSON, when the CLI reads it.
    result = cli("prepare", "DO_NOT_PRINT_THIS")
    # Then it reports validation failure without printing input or SQL.
    assert result.returncode == 2
    assert result.stdout == ""
    assert "DO_NOT_PRINT_THIS" not in result.stderr


def test_prepare_help_does_not_read_snapshot() -> None:
    # Given no input, when help is requested.
    result = cli("prepare", "", "--help")
    # Then it describes the offline input/output without connecting anywhere.
    assert result.returncode == 0
    assert "snapshot" in result.stdout
    assert "database" in result.stdout


def test_wrapper_refuses_implicit_application() -> None:
    # Given an unsupported application command, when invoked.
    result = cli("apply")
    # Then the wrapper refuses before any database command can run.
    assert result.returncode == 2
    assert "Unknown migration command" in result.stderr


def test_prepare_accepts_an_explicit_existing_snapshot_file(tmp_path: Path) -> None:
    path = tmp_path / "forms-before.json"
    path.write_text(snapshot(canonical([question("value", "value")])))
    result = cli("prepare", "", str(path))
    assert result.returncode == 0, result.stderr
    assert "Validated forms: 1" in result.stdout


def test_prepare_explains_a_missing_snapshot_file(tmp_path: Path) -> None:
    result = cli("prepare", "", str(tmp_path / "missing.json"))
    assert result.returncode == 2
    assert "Snapshot file not found" in result.stderr
    assert "does not capture a hosted snapshot" in result.stderr
    assert result.stdout == ""


def test_guide_keeps_local_application_out_of_the_hosted_checklist() -> None:
    result = cli("guide")
    assert result.returncode == 0
    assert "pnpm db:migrations:hosted" in result.stdout
    assert "apply-local" not in result.stdout
