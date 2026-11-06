"""Offline, all-row schema2 preflight. Reads an authorized JSON snapshot from stdin.

Snapshot SQL (run only with separate database-read authorization and full-table visibility):
SELECT coalesce(json_agg(json_build_object('id',id,'schema_version',schema_version,
 'definition_text',definition::text) ORDER BY id),'[]'::json) FROM fieldmaps.form_versions;

The output report is bound to every exact stored definition byte string. Applying it and the
migration requires a separate authorized, same-session operation; this module never connects.
"""

import json
import sys
from hashlib import sha256
from typing import ClassVar, Final, Literal, assert_never
from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue, TypeAdapter

from fieldmaps_api.domain.form_definition import FORM_SCHEMA_VERSION
from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.domain.legacy_forms import FormDefinition as LegacyFormDefinition

NEW_PROPERTIES: Final = frozenset({"numberMode", "valueSource", "dateTime", "columnNaming", "role"})


class PreflightRow(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid", strict=True)
    id: UUID
    schema_version: int
    definition_text: str


class ValidatedRow(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    id: UUID
    definition_sha256: str
    definition_format: Literal["canonical", "legacy_fields"] = "canonical"


class PreflightReport(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    format: Literal["decamark-schema2-preflight-1", "decamark-schema2-preflight-2"] = (
        "decamark-schema2-preflight-1"
    )
    validated_schema_version: int = FORM_SCHEMA_VERSION
    rows: list[ValidatedRow]


def contains_new_property(value: JsonValue) -> bool:
    """Conservatively reject even nested formerly ignored spellings, including unknown objects."""
    match value:
        case dict():
            return bool(NEW_PROPERTIES.intersection(value)) or any(
                contains_new_property(part) for part in value.values()
            )
        case list():
            return any(contains_new_property(part) for part in value)
        case str() | int() | float() | None:
            return False
        case _:
            assert_never(value)


def preflight(rows: list[PreflightRow]) -> PreflightReport:
    validated: list[ValidatedRow] = []
    if len({row.id for row in rows}) != len(rows):
        message = "Preflight snapshot contains duplicate form IDs"
        raise ValueError(message)
    for row in rows:
        if row.schema_version != 1:
            message = (
                f"{row.id}: preflight requires schema version 1; "
                f"found schema version {row.schema_version}. "
                "Check the target's migration history before proceeding"
            )
            raise ValueError(message)
        raw = TypeAdapter[JsonValue](JsonValue).validate_json(row.definition_text)
        if contains_new_property(raw):
            message = f"{row.id}: formerly ignored schema2 property needs explicit adjudication"
            raise ValueError(message)
        definition_format: Literal["canonical", "legacy_fields"] = "canonical"
        if isinstance(raw, dict) and "fields" in raw and "questions" not in raw:
            LegacyFormDefinition.model_validate(raw)
            definition_format = "legacy_fields"
        else:
            FormDefinition.model_validate(raw)
        validated.append(
            ValidatedRow(
                id=row.id,
                definition_sha256=sha256(row.definition_text.encode()).hexdigest(),
                definition_format=definition_format,
            )
        )
    return PreflightReport(
        format=(
            "decamark-schema2-preflight-2"
            if any(row.definition_format == "legacy_fields" for row in validated)
            else "decamark-schema2-preflight-1"
        ),
        rows=validated,
    )


def main() -> None:
    rows = TypeAdapter(list[PreflightRow]).validate_json(sys.stdin.buffer.read())
    report = preflight(rows)
    sys.stdout.write(json.dumps(report.model_dump(mode="json"), sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
