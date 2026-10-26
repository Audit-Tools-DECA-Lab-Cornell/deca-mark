import sys
from hashlib import sha256
from typing import Final

from pydantic import TypeAdapter, ValidationError

from fieldmaps_api.form_schema_preflight import PreflightRow, preflight
from fieldmaps_api.form_schema_upgrade import VERSION, application_sql, migration_for

USAGE: Final = (
    "Usage: pnpm --silent db:forms:prepare /absolute/path/to/existing-snapshot.json > apply.sql\n"
    "Alternatively, supply the JSON snapshot on stdin.\n"
    "Reads an all-row JSON snapshot from stdin; writes migration SQL for review to stdout.\n"
    "The snapshot must already exist; this command does not capture hosted forms.\n"
    "Offline only: never connects to a database or applies SQL.\n"
    "Use database/hosted/form-schema2-rollout.md for target selection and release gates.\n"
)


def prepare_sql(snapshot: bytes) -> str:
    rows = TypeAdapter(list[PreflightRow]).validate_json(snapshot)
    report = preflight(rows)
    migration = migration_for(report)
    source = migration.read_bytes()
    legacy_count = sum(row.definition_format == "legacy_fields" for row in report.rows)
    return (
        f"-- Migration version: {VERSION}\n"
        f"-- Execution source: {migration.name}\n"
        f"-- Migration SHA256: {sha256(source).hexdigest()}\n"
        f"-- Validated forms: {len(report.rows)}\n"
        f"-- Legacy forms preserved: {legacy_count}\n"
        "SET lock_timeout='5s';\n"
        "SET statement_timeout='2min';\n"
        "SET row_security=off;\n" + application_sql(report, source.decode()) + "\n"
    )


def main() -> None:
    args = sys.argv[1:]
    if args in (["--help"], ["-h"]):
        sys.stdout.write(USAGE)
        return
    if args:
        sys.stderr.write(USAGE)
        raise SystemExit(2)
    try:
        sql = prepare_sql(sys.stdin.buffer.read())
    except ValidationError:
        sys.stderr.write(
            "Cannot prepare: snapshot or form definition failed validation. "
            "Resolve invalid forms using the schema2 rollout guide. "
            "No SQL was emitted.\n"
        )
        raise SystemExit(2) from None
    except ValueError as error:
        sys.stderr.write(f"Cannot prepare: {error}. No SQL was emitted.\n")
        raise SystemExit(2) from None
    sys.stdout.write(sql)


if __name__ == "__main__":
    main()
