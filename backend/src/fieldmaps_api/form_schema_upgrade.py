"""Explicit local-only schema2 operation through Docker's Unix-socket PostgreSQL access.

No configuration, environment or credential file is read. Apply only after separate migration
approval: sh database/form-schema2.sh apply-local. Preflight is read-only. Disposable rehearsals
may supply their newly created decamark-baseline-N, decamark-schema2-N or
fieldmaps-zone-api-N container name.
"""

import re
import subprocess
import sys
from pathlib import Path
from typing import Final, Literal

from pydantic import TypeAdapter, ValidationError

from fieldmaps_api.form_schema_preflight import PreflightReport, PreflightRow, preflight

VERSION: Final = "20261024090000"
NAME: Final = "form_schema2"
MAX_ARGUMENTS: Final = 2
MIGRATION: Final = (
    Path(__file__).resolve().parents[3] / "supabase/migrations" / f"{VERSION}_{NAME}.sql"
)
PRESERVATION_MIGRATION: Final = (
    MIGRATION.parents[1] / "repairs" / f"{VERSION}_form_schema2_preserve_legacy.sql"
)
SNAPSHOT_SQL: Final = """
SELECT coalesce(json_agg(json_build_object('id',id,'schema_version',schema_version,
 'definition_text',definition::text) ORDER BY id),'[]'::json) FROM fieldmaps.form_versions;
"""


def psql(container: str, sql: str) -> str:
    """Only address the named local stack or a newly created rehearsal container."""
    if container != "supabase_db_field-maps" and not re.fullmatch(
        r"(?:decamark-(?:baseline|schema2)|fieldmaps-zone-api)-[0-9]+", container
    ):
        message = (
            "Only the known local Supabase or explicitly named disposable container is allowed"
        )
        raise ValueError(message)
    command = ["docker", "exec", "-i", container, "psql", "-X", "-U", "postgres", "-d", "postgres"]
    if container != "supabase_db_field-maps":
        command.extend(["-h", "/tmp"])  # noqa: S108 - socket in new isolated container
    command.extend(["-v", "ON_ERROR_STOP=1", "-t", "-A"])
    result = subprocess.run(  # noqa: S603 - fixed executable and validated local-only target
        command, input=sql, text=True, capture_output=True, check=True, timeout=120
    )
    return result.stdout.strip()


def snapshot_report(container: str) -> PreflightReport:
    rows = TypeAdapter(list[PreflightRow]).validate_json(psql(container, SNAPSHOT_SQL))
    return preflight(rows)


def migration_for(report: PreflightReport) -> Path:
    legacy = any(row.definition_format == "legacy_fields" for row in report.rows)
    if legacy != (report.format == "decamark-schema2-preflight-2"):
        message = "Preflight report format does not match its legacy classification"
        raise ValueError(message)
    return PRESERVATION_MIGRATION if legacy else MIGRATION


def sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def migration_body(source: str) -> str:
    """Keep source, report and Supabase history in the caller's single transaction."""
    lines = source.splitlines()
    if lines.count("BEGIN;") != 1 or lines.count("COMMIT;") != 1:
        message = "Expected exactly one explicit migration transaction"
        raise ValueError(message)
    return "\n".join(line for line in lines if line not in {"BEGIN;", "COMMIT;"})


def application_sql(report: PreflightReport, source: str) -> str:
    """Record the exact migration source in Supabase history atomically with the transition."""
    history = f"""
INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
VALUES ({sql_literal(VERSION)},{sql_literal(NAME)},ARRAY[{sql_literal(source)}]);
"""  # noqa: S608 - fixed version/name and SQL-quoted tracked source
    return (
        "BEGIN;\nSELECT set_config('fieldmaps.schema2_preflight',"
        + sql_literal(report.model_dump_json())
        + ",true);\n"
        + migration_body(source)
        + history
        + "\nCOMMIT;"
    )


def run(mode: Literal["preflight", "apply-local"], container: str) -> PreflightReport:
    report = snapshot_report(container)
    if mode == "apply-local":
        psql(container, application_sql(report, migration_for(report).read_text()))
    return report


def main() -> None:
    args = sys.argv[1:]
    if not args or len(args) > MAX_ARGUMENTS or args[0] not in {"preflight", "apply-local"}:
        sys.stderr.write("Usage: sh database/form-schema2.sh preflight|apply-local [CONTAINER]\n")
        raise SystemExit(2)
    container = args[1] if len(args) == MAX_ARGUMENTS else "supabase_db_field-maps"
    try:
        report = run("preflight" if args[0] == "preflight" else "apply-local", container)
    except ValidationError:
        sys.stderr.write(
            "Local schema2 preflight refused: invalid stored definition. "
            "No migration was applied. Hosted Supabase was not changed.\n"
        )
        raise SystemExit(2) from None
    except ValueError as error:
        sys.stderr.write(
            f"Local schema2 preflight refused: {error}.\n"
            "If local history already includes 20261024090000 and rows are schema2, "
            "the local upgrade is complete; do not reapply it.\n"
            "No migration was applied. Hosted Supabase was not changed.\n"
        )
        raise SystemExit(2) from None
    sys.stdout.write(
        f"{args[0]}: {len(report.rows)} stored rows validated; schema2 report bound; "
        f"source {migration_for(report).name}.\n"
    )


if __name__ == "__main__":
    main()
