"""Canonical validation and compatibility with immutable legacy field definitions."""

import math
from dataclasses import dataclass
from typing import Annotated, Literal, Self, assert_never

from pydantic import Discriminator, JsonValue, Tag, model_validator

from fieldmaps_api.domain.form_definition import CanonicalDefinition, Question
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
from fieldmaps_api.domain.legacy_forms import (
    AnswerError,
)
from fieldmaps_api.domain.legacy_forms import (
    FormDefinition as LegacyFormDefinition,
)
from fieldmaps_api.domain.legacy_forms import (
    validate_answers as validate_legacy_answers,
)

__all__ = [
    "AnswerError",
    "FormDefinition",
    "normalize_answers",
    "review_problems",
    "validate_answers",
]


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


def definition_format(value: JsonValue | StoredCanonicalDefinition | LegacyFormDefinition) -> str:
    match value:
        case StoredCanonicalDefinition():
            return "canonical"
        case LegacyFormDefinition():
            return "legacy"
        case dict() if "questions" in value:
            return "canonical"
        case _:
            return "legacy"


type StoredFormDefinition = Annotated[
    Annotated[StoredCanonicalDefinition, Tag("canonical")]
    | Annotated[LegacyFormDefinition, Tag("legacy")],
    Discriminator(definition_format),
]
type Reason = Literal["required", "range", "type", "option", "duplicate", "maxLength"]


@dataclass(frozen=True, slots=True)
class ReviewProblem:
    id: str
    reason: Reason


def answer_problem(question: Question, value: JsonValue) -> Reason | None:
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
        case "one":
            if not isinstance(value, str):
                return "type"
            valid = not trim_text(value) or any(option.code == value for option in question.options)
            return None if valid else "option"
        case "many":
            return many_problem(question, value)
        case _:
            assert_never(question.kind)


def number_problem(question: Question, value: JsonValue) -> Reason | None:
    if not isinstance(value, int | float) or isinstance(value, bool):
        return "type"
    if (
        (isinstance(value, float) and (not math.isfinite(value) or not value.is_integer()))
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
            if question.required:
                problems.append(ReviewProblem(question.id, "required"))
            continue
        value = answers[question.id]
        reason = answer_problem(question, value)
        if reason:
            problems.append(ReviewProblem(question.id, reason))
        elif question.required and not is_answered(value):
            problems.append(ReviewProblem(question.id, "required"))
    return problems


@dataclass(frozen=True, slots=True)
class NormalizedAnswers:
    answers: Answers
    pruned: list[str]


def normalize_answers(definition: StoredFormDefinition, answers: Answers) -> NormalizedAnswers:
    """Validate before pruning; retain the old PUT's field-keyed storage contract.

    Stored shell-v1 uses field codes people/notes, which are already its canonical
    question IDs. Its observer is envelope metadata, not a legacy answer field.
    Legacy definitions keep their existing bounds and types; no migration rewrites them.
    """
    match definition:
        case LegacyFormDefinition():
            return NormalizedAnswers(validate_legacy_answers(definition, answers), [])
        case StoredCanonicalDefinition():
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
        case _:
            assert_never(definition)


def validate_answers(definition: StoredFormDefinition, answers: Answers) -> Answers:
    return normalize_answers(definition, answers).answers
