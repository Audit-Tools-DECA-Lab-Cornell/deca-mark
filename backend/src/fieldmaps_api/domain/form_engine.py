"""Visibility and interactive pruning, matching the mobile form engine."""

from dataclasses import dataclass
from typing import Final, assert_never

from pydantic import JsonValue

from fieldmaps_api.domain.form_definition import (
    Answered,
    CanonicalDefinition,
    Comparison,
    Condition,
    Junction,
    Question,
)

type Answers = dict[str, JsonValue]

# ECMAScript WhiteSpace + LineTerminator; Python strip additionally removes NEL
# and omits BOM, changing answered conditions across the server/device boundary.
JS_WHITESPACE: Final = (
    "\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680"
    "\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a"
    "\u2028\u2029\u202f\u205f\u3000\ufeff"
)


def trim_text(value: str) -> str:
    return value.strip(JS_WHITESPACE)


def is_answered(value: JsonValue) -> bool:
    match value:
        case None | bool() | dict():
            return False
        case int() | float():
            return True
        case str():
            return bool(trim_text(value))
        case list():
            return bool(value)
        case _:
            assert_never(value)


def evaluate(condition: Condition, answers: Answers) -> bool:
    match condition:
        case Answered(question=question):
            return is_answered(answers.get(question))
        case Comparison():
            value = answers.get(condition.question)
            match condition.kind:
                case "equals":
                    return value == condition.option
                case "notEquals":
                    return value != condition.option
                case "includes":
                    return isinstance(value, list) and condition.option in value
                case _:
                    assert_never(condition.kind)
        case Junction():
            match condition.kind:
                case "all":
                    return all(evaluate(part, answers) for part in condition.of)
                case "any":
                    return any(evaluate(part, answers) for part in condition.of)
                case _:
                    assert_never(condition.kind)
        case _:
            assert_never(condition)


def resolve_question(question: Question, answers: Answers) -> Question:
    dynamic = question.dynamic_from
    if dynamic is None:
        return question
    parent = answers.get(dynamic.question)
    group = dynamic.sets.get(parent) if isinstance(parent, str) else None
    if group is None:
        return question.model_copy(update={"options": []})
    return question.model_copy(
        update={
            "code": group.code,
            "export_column": group.export_column,
            "label": group.label,
            "options": group.options,
        }
    )


def visible_questions(form: CanonicalDefinition, answers: Answers) -> list[Question]:
    active: Answers = {}
    visible: list[Question] = []
    for question in form.questions:
        if question.depends_on and not evaluate(question.depends_on, active):
            continue
        visible.append(resolve_question(question, active))
        if question.id in answers:
            active[question.id] = answers[question.id]
    return visible


def retain_value(question: Question, value: JsonValue) -> JsonValue:
    match question.kind:
        case "number":
            return value if isinstance(value, int | float) and not isinstance(value, bool) else None
        case "text" | "dateTime":
            return value if isinstance(value, str) and trim_text(value) else None
        case "one":
            codes = {option.code for option in question.options}
            return value if isinstance(value, str) and value in codes else None
        case "many":
            if not isinstance(value, list):
                return None
            codes = {option.code for option in question.options}
            kept: list[JsonValue] = [
                code for code in value if isinstance(code, str) and code in codes
            ]
            return kept or None
        case _:
            assert_never(question.kind)


@dataclass(frozen=True, slots=True)
class Pruned:
    answers: Answers
    dropped: list[str]


def prune_answers(form: CanonicalDefinition, answers: Answers) -> Pruned:
    dropped: list[str] = []
    current = answers
    authored = {question.id for question in form.questions}
    while True:
        visible = {question.id: question for question in visible_questions(form, current)}
        following: Answers = {}
        changed = False
        for question_id, value in current.items():
            question = visible.get(question_id)
            kept = retain_value(question, value) if question else None
            if kept is None:
                changed = True
                if question_id in authored:
                    dropped.append(question_id)
                continue
            following[question_id] = kept
            if isinstance(value, list) and isinstance(kept, list) and len(value) != len(kept):
                changed = True
        current = following
        if not changed:
            return Pruned(current, dropped)
