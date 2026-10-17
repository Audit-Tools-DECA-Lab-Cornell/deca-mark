"""Canonical form and answer validation."""

import math
from dataclasses import dataclass
from typing import Literal, Self, assert_never

from pydantic import JsonValue, model_validator

from fieldmaps_api.domain.form_definition import CanonicalDefinition, Question
from fieldmaps_api.domain.form_engine import (
    Answers,
    is_answered,
    prune_answers,
    trim_text,
    visible_questions,
)
from fieldmaps_api.domain.form_references import definition_problems

__all__ = [
    "AnswerError",
    "FormDefinition",
    "normalize_answers",
    "review_problems",
    "validate_answers",
]


class AnswerError(ValueError):
    """An answer the form does not allow, phrased for the observer who sent it."""


class FormDefinition(CanonicalDefinition):
    @model_validator(mode="after")
    def check_references(self) -> Self:
        problems = definition_problems(self)
        if problems:
            message = f'Form "{self.version}" cannot be used: {" ".join(problems)}'
            raise ValueError(message)
        return self


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


def review_problems(form: FormDefinition, answers: Answers) -> list[ReviewProblem]:
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


def normalize_answers(definition: FormDefinition, answers: Answers) -> NormalizedAnswers:
    """Validate answers against the frozen canonical definition before pruning."""
    problems = review_problems(definition, answers)
    if problems:
        message = "; ".join(f"{problem.id}: {problem.reason}" for problem in problems)
        raise AnswerError(message)
    result = prune_answers(definition, answers)
    return NormalizedAnswers(result.answers, result.dropped)


def validate_answers(definition: FormDefinition, answers: Answers) -> Answers:
    return normalize_answers(definition, answers).answers
