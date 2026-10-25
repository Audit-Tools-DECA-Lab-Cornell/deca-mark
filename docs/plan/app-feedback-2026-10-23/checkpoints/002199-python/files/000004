"""Definition reference, ordering, export and cycle validation."""

from typing import assert_never

from fieldmaps_api.domain.form_definition import (
    Answered,
    CanonicalDefinition,
    Comparison,
    Condition,
    Junction,
    Question,
)
from fieldmaps_api.domain.form_question_rules import extended_question_problems


def references(condition: Condition) -> list[str]:
    match condition:
        case Junction(of=parts):
            return [reference for part in parts for reference in references(part)]
        case Answered(question=question) | Comparison(question=question):
            return [question]
        case _:
            assert_never(condition)


def dependencies(question: Question) -> list[str]:
    result = references(question.depends_on) if question.depends_on else []
    if question.dynamic_from:
        result.append(question.dynamic_from.question)
    return result


def condition_problems(owner: str, condition: Condition, by_id: dict[str, Question]) -> list[str]:
    match condition:
        case Junction(of=parts):
            return [problem for part in parts for problem in condition_problems(owner, part, by_id)]
        case Answered():
            return []
        case Comparison():
            target = by_id.get(condition.question)
            if target is None:
                return []
            problems: list[str] = []
            if condition.kind == "includes" and target.kind != "many":
                problems.append(
                    f'"{owner}" tests whether "{target.id}" includes an option, '
                    "but it is not a multi-select."
                )
            if condition.kind != "includes" and target.kind == "many":
                problems.append(
                    f'"{owner}" compares "{target.id}" to a single option, '
                    "but it holds several. Use includes."
                )
            codes = {option.code for option in target.options}
            if target.dynamic_from:
                codes.update(
                    option.code
                    for group in target.dynamic_from.sets.values()
                    for option in group.options
                )
            if (
                target.options_pending is None
                and target.kind in {"one", "many"}
                and codes
                and condition.option not in codes
            ):
                problems.append(
                    f'"{owner}" tests "{target.id}" against "{condition.option}", '
                    "which is not one of its options."
                )
            return problems
        case _:
            assert_never(condition)


def inverted_bounds(question: Question) -> bool:
    return (
        question.kind == "number"
        and question.min is not None
        and question.max is not None
        and question.min > question.max
    )


def definition_problems(form: CanonicalDefinition) -> list[str]:
    """Check authoring eligibility in addition to safe historical interpretation."""
    return structural_problems(form) + [
        f'"{question.id}" has a minimum greater than its maximum.'
        for question in form.questions
        if inverted_bounds(question)
    ]


def structural_problems(form: CanonicalDefinition) -> list[str]:
    problems: list[str] = []
    by_id: dict[str, Question] = {}
    for question in form.questions:
        if question.id in by_id:
            problems.append(f'Duplicate question id "{question.id}".')
        by_id[question.id] = question
    columns: dict[str, str] = {}
    for question in form.questions:
        column = question.export_column
        if not column:
            continue
        if column in columns and column not in form.known_export_collisions:
            problems.append(
                f'Export column "{column}" is claimed by both '
                f'"{columns[column]}" and "{question.id}".'
            )
        columns[column] = question.id
    for question in form.questions:
        problems.extend(question_problems(question, form, by_id))
    problems.extend(cycle_problems(form, by_id))
    return problems


def question_problems(
    question: Question, form: CanonicalDefinition, by_id: dict[str, Question]
) -> list[str]:
    problems: list[str] = []
    problems.extend(extended_question_problems(question, form))
    if question.options_pending is not None and question.required:
        problems.append(f'"{question.id}" is required but its option list has not been supplied.')
    choice = question.kind in {"one", "many"}
    if (
        choice
        and not question.options
        and not question.dynamic_from
        and question.options_pending is None
    ):
        problems.append(f'"{question.id}" is a choice question with no options.')
    if not choice and question.options:
        problems.append(f'"{question.id}" is not a choice question but carries options.')
    if question.depends_on:
        problems.extend(condition_problems(question.id, question.depends_on, by_id))
    for reference in dependencies(question):
        target = by_id.get(reference)
        if target is None:
            problems.append(f'"{question.id}" references unknown question "{reference}".')
        elif form.questions.index(target) > form.questions.index(question):
            problems.append(
                f'"{question.id}" depends on "{reference}", which is authored after it.'
            )
    dynamic = question.dynamic_from
    if dynamic is None or dynamic.question not in by_id:
        return problems
    parent = by_id[dynamic.question]
    if parent.kind != "one":
        problems.append(
            f'"{question.id}" takes options from "{parent.id}", which is not a single choice.'
        )
    parent_codes = {option.code for option in parent.options}
    problems.extend(
        f'"{question.id}" has an option set for "{key}", which "{parent.id}" cannot answer.'
        for key in dynamic.sets
        if key not in parent_codes
    )

    return problems


def cycle_problems(form: CanonicalDefinition, by_id: dict[str, Question]) -> list[str]:
    problems: list[str] = []
    visiting: set[str] = set()
    settled: set[str] = set()

    def walk(question_id: str, trail: list[str]) -> None:
        if question_id in settled:
            return
        if question_id in visiting:
            problems.append(f"Dependency cycle: {' → '.join([*trail, question_id])}.")
            return
        visiting.add(question_id)
        question = by_id.get(question_id)
        if question:
            for reference in dependencies(question):
                walk(reference, [*trail, question_id])
        visiting.remove(question_id)
        settled.add(question_id)

    for question in form.questions:
        walk(question.id, [])
    return problems
