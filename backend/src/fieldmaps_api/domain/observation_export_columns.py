"""Historical form column planning, matching the existing web export naming rules."""

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Final, assert_never

from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.form_definition import Option, Question
from fieldmaps_api.domain.forms import FormDefinition, StoredFormDefinition
from fieldmaps_api.domain.legacy_forms import FormDefinition as LegacyDefinition

RECORD_COLUMNS: Final = (
    "observation_id",
    "label",
    "project_id",
    "user_id",
    "site_id",
    "site_code",
    "site_name",
    "zone",
    "round_type",
    "Rel_Round",
    "First_Round",
    "placement",
    "observer",
    "observed_at",
    "received_at",
    "form_version",
    "revision",
    "longitude",
    "latitude",
    "package_id",
    "map_version",
    "zone_id",
    "zone_code",
    "zone_label_at_capture",
    "assignment_basis",
    "spatial_support",
    "display_anchor_longitude",
    "display_anchor_latitude",
    "display_anchor_basis",
)


@dataclass(frozen=True, slots=True)
class ExportQuestion:
    id: str
    column: str
    label: str
    kind: str
    values: str
    dynamic_parent: str | None = None
    sets: tuple[tuple[str, str, str, str], ...] = ()


@dataclass(frozen=True, slots=True)
class Column:
    header: str
    question_id: str
    label: str
    kind: str
    values: str
    versions: tuple[str, ...]
    option_set: str | None = None


@dataclass(frozen=True, slots=True)
class Source:
    question_id: str
    own: str | None
    parent: str | None
    sets: tuple[tuple[str, str], ...]

    def header(self, answers: dict[str, JsonValue]) -> str | None:
        parent = None if self.parent is None else answers.get(self.parent)
        return next((header for key, header in self.sets if key == parent), self.own)


@dataclass(frozen=True, slots=True)
class Plan:
    columns: tuple[Column, ...]
    codebook: tuple[Column, ...]
    sources: dict[str, tuple[Source, ...]]


def option_list(options: Sequence[Option]) -> str:
    return "; ".join(f"{option.code} = {option.label}" for option in options)


def canonical_question(question: Question) -> ExportQuestion:
    dynamic = question.dynamic_from
    sets = (
        ()
        if dynamic is None
        else tuple(
            (key, value.export_column, value.label, option_list(value.options))
            for key, value in dynamic.sets.items()
        )
    )
    all_options = list(question.options)
    if dynamic is not None:
        seen = {option.code for option in all_options}
        for group in dynamic.sets.values():
            for option in group.options:
                if option.code not in seen:
                    all_options.append(option)
                    seen.add(option.code)
    return ExportQuestion(
        question.id,
        question.export_column,
        question.label,
        question.kind,
        option_list(all_options),
        None if dynamic is None else dynamic.question,
        sets,
    )


def questions(raw: dict[str, JsonValue]) -> tuple[ExportQuestion, ...]:
    adapter: TypeAdapter[StoredFormDefinition] = TypeAdapter(StoredFormDefinition)
    definition = adapter.validate_python(raw)
    match definition:
        case FormDefinition():
            return tuple(canonical_question(question) for question in definition.questions)
        case LegacyDefinition():
            return tuple(
                ExportQuestion(
                    field.code, field.code, field.code, field.type, "; ".join(field.options)
                )
                for field in definition.fields
            )
        case _:
            assert_never(definition)


def repeated(question_id: str) -> bool:
    return question_id in {"observer", "observer_initials"}


def free_header(natural: str, question: str, taken: set[str]) -> str:
    reserved = {*RECORD_COLUMNS, "answers", "geometry", "display_anchor"}
    base = f"answer_{natural}" if natural in reserved else natural
    if base.lstrip().startswith(("=", "+", "-", "@")) or base.startswith(("\t", "\r", "\n")):
        base = "'" + base
    if base not in taken:
        return base
    candidate = f"{base}_{question}"
    suffix = 2
    while candidate in taken:
        candidate = f"{base}_{question}_{suffix}"
        suffix += 1
    return candidate
