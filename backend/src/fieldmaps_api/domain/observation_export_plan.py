"""Mutable column accumulator is local to one immutable export plan construction."""

from collections.abc import Sequence

from pydantic import JsonValue

from fieldmaps_api.domain.observation_export_columns import (
    Column,
    ExportQuestion,
    Plan,
    Source,
    free_header,
    questions,
    repeated,
)
from fieldmaps_api.observation_analysis_schemas import HistoricalObservation


class ColumnBuilder:
    """Mutates only while allocating unique columns; freezes its result into Plan."""

    def __init__(self) -> None:
        self.columns: dict[str, Column] = {}
        self.metadata: list[Column] = []

    def claim(
        self,
        version: str,
        taken: set[str],
        natural: str,
        question: ExportQuestion,
        meaning: tuple[str, str, str | None],
    ) -> str:
        header = free_header(natural, question.id, taken)
        taken.add(header)
        self.describe(header, version, question, meaning)
        return header

    def describe(
        self,
        header: str,
        version: str,
        question: ExportQuestion,
        meaning: tuple[str, str, str | None],
    ) -> None:
        label, values, option_set = meaning
        column = Column(header, question.id, label, question.kind, values, (version,), option_set)
        self.columns.setdefault(header, column)
        if column not in self.metadata:
            self.metadata.append(column)


def question_source(
    builder: ColumnBuilder,
    version: str,
    taken: set[str],
    question: ExportQuestion,
    rows: Sequence[HistoricalObservation],
) -> Source:
    named = tuple(group for group in question.sets if group[1].strip())
    named_keys = tuple(group[0] for group in named)
    needs_own = any(
        row.form_version == version
        and question.id in row.answers
        and row.answers.get(question.dynamic_parent or "") not in named_keys
        for row in rows
    )
    own = (
        builder.claim(
            version,
            taken,
            question.column.strip() or question.id,
            question,
            (question.label, question.values, None),
        )
        if not question.sets or len(named) < len(question.sets) or needs_own
        else None
    )
    claimed = {} if own is None else {question.column.strip() or question.id: own}
    set_sources: list[tuple[str, str]] = []
    for key, raw_column, label, values in named:
        natural = raw_column.strip()
        header = claimed.get(natural)
        if header is None:
            header = builder.claim(version, taken, natural, question, (label, values, key))
            claimed[natural] = header
        else:
            builder.describe(header, version, question, (label, values, key))
        set_sources.append((key, header))
    return Source(question.id, own, question.dynamic_parent, tuple(set_sources))


def plan(
    rows: Sequence[HistoricalObservation], definitions: dict[str, dict[str, JsonValue]]
) -> Plan:
    builder = ColumnBuilder()
    sources: dict[str, tuple[Source, ...]] = {}
    for version, definition in sorted(definitions.items()):
        taken: set[str] = set()
        version_sources: list[Source] = []
        omitted: set[str] = set()
        for question in questions(definition):
            if repeated(question.id) and all(
                question.id not in row.answers or row.answers[question.id] == row.observer
                for row in rows
                if row.form_version == version
            ):
                omitted.add(question.id)
            else:
                version_sources.append(question_source(builder, version, taken, question, rows))
        mapped = {source.question_id for source in version_sources} | omitted
        for row in rows:
            if row.form_version != version:
                continue
            for key in row.answers:
                if key in mapped:
                    continue
                question = ExportQuestion(key, key, key, "unknown", "")
                header = builder.claim(version, taken, key, question, (key, "", None))
                version_sources.append(Source(key, header, None, ()))
                mapped.add(key)
        sources[version] = tuple(version_sources)
    return Plan(tuple(builder.columns.values()), tuple(builder.metadata), sources)


def answer_cells(planned: Plan, row: HistoricalObservation) -> dict[str, JsonValue]:
    result: dict[str, JsonValue] = {}
    for source in planned.sources[row.form_version]:
        if source.question_id not in row.answers:
            continue
        header = source.header(row.answers)
        if header is not None:
            result[header] = row.answers[source.question_id]
    return result
