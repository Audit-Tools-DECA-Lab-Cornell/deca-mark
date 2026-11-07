"""Canonical validation of form definitions and of the answers recorded against them."""

from dataclasses import dataclass
from typing import Literal, Self, assert_never

from pydantic import JsonValue, model_validator

from fieldmaps_api.domain.form_definition import (
    MAX_SAFE_INTEGER,
    CanonicalDefinition,
    Question,
    finite_json_number,
)
from fieldmaps_api.domain.form_engine import (
    Answers,
    is_answered,
    prune_answers,
    trim_text,
    visible_questions,
)
from fieldmaps_api.domain.form_references import (
    definition_problems,
    inverted_bounds,
    structural_problems,
)
from fieldmaps_api.domain.form_temporal import valid_temporal

__all__ = [
    "AnswerError",
    "FormDefinition",
    "normalize_answers",
    "review_problems",
    "validate_answers",
]


class AnswerError(ValueError):
    """An answer the form does not allow, phrased for the observer who sent it."""


class StoredCanonicalDefinition(CanonicalDefinition):
    """Interpret immutable instruments without applying new authoring eligibility."""

    @model_validator(mode="after")
    def check_references(self) -> Self:
        problems = structural_problems(self)
        if problems:
            message = f'Form "{self.version}" cannot be used: {" ".join(problems)}'
            raise ValueError(message)
        return self


class FormDefinition(StoredCanonicalDefinition):
    """Strict eligibility for creation, editing and reviewed publication."""

    @model_validator(mode="after")
    def check_authoring(self) -> Self:
        problems = definition_problems(self)
        if problems:
            message = f'Form "{self.version}" cannot be used: {" ".join(problems)}'
            raise ValueError(message)
        return self


class PublishedFormBoundsError(AnswerError):
    """A submitted answer requires an impossible published numeric constraint."""


type Reason = Literal["required", "range", "type", "option", "duplicate", "maxLength"]


@dataclass(frozen=True, slots=True)
class ReviewProblem:
    id: str
    reason: Reason


def answer_problem(  # noqa: PLR0911 - one branch per canonical question kind
    question: Question, value: JsonValue
) -> Reason | None:
    match question.kind:
        case "number":
            return number_problem(question, value)
        case "text":
            if not isinstance(value, str):
                return "type"
            return (
                "maxLength"
                if question.max_length is not None and len(value) > question.max_length
                else None
            )
        case "dateTime":
            return temporal_problem(question, value)
        case "one":
            if not isinstance(value, str):
                return "type"
            valid = not trim_text(value) or any(option.code == value for option in question.options)
            return None if valid else "option"
        case "many":
            return many_problem(question, value)
        case _:
            assert_never(question.kind)


def temporal_problem(question: Question, value: JsonValue) -> Reason | None:
    if not isinstance(value, str):
        return "type"
    if not trim_text(value):
        return None
    config = question.date_time
    return None if config is not None and valid_temporal(config.mode, value) else "range"


def number_problem(question: Question, value: JsonValue) -> Reason | None:
    if not isinstance(value, int | float) or isinstance(value, bool):
        return "type"
    if (
        (not finite_json_number(value))
        or (
            question.number_mode != "decimal"
            and (
                abs(value) > MAX_SAFE_INTEGER
                or (isinstance(value, float) and not value.is_integer())
            )
        )
        or (question.min is not None and value < question.min)
        or (question.max is not None and value > question.max)
    ):
        return "range"
    return None


def many_problem(question: Question, value: JsonValue) -> Reason | None:
    if not isinstance(value, list):
        return "type"
    if any(value[:index].count(code) for index, code in enumerate(value)):
        return "duplicate"
    codes = {option.code for option in question.options}
    return None if all(isinstance(code, str) and code in codes for code in value) else "option"


def review_problems(form: StoredCanonicalDefinition, answers: Answers) -> list[ReviewProblem]:
    problems: list[ReviewProblem] = []
    for question in visible_questions(form, answers):
        if question.id not in answers:
            if question.required or question.value_source in {
                "accountId",
                "observerCode",
                "captureTime",
            }:
                problems.append(ReviewProblem(question.id, "required"))
            continue
        value = answers[question.id]
        reason = answer_problem(question, value)
        if reason:
            problems.append(ReviewProblem(question.id, reason))
        elif (
            question.required
            or question.value_source in {"accountId", "observerCode", "captureTime"}
        ) and not is_answered(value):
            problems.append(ReviewProblem(question.id, "required"))
    return problems


@dataclass(frozen=True, slots=True)
class NormalizedAnswers:
    answers: Answers
    pruned: list[str]


def normalize_answers(definition: StoredCanonicalDefinition, answers: Answers) -> NormalizedAnswers:
    """Validate before pruning; keep the field-keyed storage contract of the old PUT."""
    impossible = [
        question.id
        for question in visible_questions(definition, answers)
        if inverted_bounds(question) and (question.required or question.id in answers)
    ]
    if impossible:
        message = (
            f'Published form "{definition.version}" has contradictory numeric bounds for '
            f"{', '.join(impossible)}. No answer can satisfy these bounds. "
            "Keep this record and contact the project coordinator; "
            "do not change its binding."
        )
        raise PublishedFormBoundsError(message)
    problems = review_problems(definition, answers)
    if problems:
        message = "; ".join(f"{problem.id}: {problem.reason}" for problem in problems)
        raise AnswerError(message)
    result = prune_answers(definition, answers)
    return NormalizedAnswers(result.answers, result.dropped)


def validate_answers(definition: StoredCanonicalDefinition, answers: Answers) -> Answers:
    return normalize_answers(definition, answers).answers
