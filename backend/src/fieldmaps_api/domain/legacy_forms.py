"""Read immutable pre-canonical field definitions without changing legacy uploads."""

from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue

FieldType = Literal["text", "integer", "number", "choice", "multi-choice", "boolean"]


class FormField(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")

    code: str = Field(min_length=1, max_length=100)
    type: FieldType
    required: bool = False
    minimum: float | None = None
    maximum: float | None = None
    maxLength: int | None = None  # noqa: N815 — the stored definitions spell it this way.
    options: list[str] = Field(default_factory=list[str])


class FormDefinition(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")

    fields: list[FormField]


class AnswerError(ValueError):
    """An answer the form does not allow, phrased for the observer who sent it."""


def validate_answers(
    definition: FormDefinition, answers: dict[str, JsonValue]
) -> dict[str, JsonValue]:
    """Check every answer against its field, and every required field against the answers."""
    known = {field.code: field for field in definition.fields}
    unknown = sorted(set(answers) - set(known))
    if unknown:
        message = f"This form has no field named {', '.join(unknown)}"
        raise AnswerError(message)
    for field in definition.fields:
        value = answers.get(field.code)
        if value is None:
            if field.required:
                message = f"{field.code} is required by this form"
                raise AnswerError(message)
            continue
        _check(field, value)
    return answers


def _check(field: FormField, value: JsonValue) -> None:
    if field.type == "text":
        _require(isinstance(value, str), field, "text")
        if field.maxLength is not None and isinstance(value, str) and len(value) > field.maxLength:
            message = f"{field.code} may hold {field.maxLength} characters"
            raise AnswerError(message)
    elif field.type in {"integer", "number"}:
        # bool is an int in Python, and a checkbox answer is not a count.
        numeric = isinstance(value, int | float) and not isinstance(value, bool)
        _require(numeric and (field.type == "number" or isinstance(value, int)), field, field.type)
        _range(field, float(value) if isinstance(value, int | float) else 0.0)
    elif field.type == "boolean":
        _require(isinstance(value, bool), field, "yes or no")
    elif field.type == "choice":
        _require(isinstance(value, str), field, "one option")
        _option(field, value)
    else:
        _require(isinstance(value, list), field, "a list of options")
        for chosen in value if isinstance(value, list) else []:
            _option(field, chosen)


def _require(condition: bool, field: FormField, expected: str) -> None:  # noqa: FBT001
    if not condition:
        message = f"{field.code} takes {expected}"
        raise AnswerError(message)


def _range(field: FormField, value: float) -> None:
    if field.minimum is not None and value < field.minimum:
        message = f"{field.code} cannot be below {field.minimum:g}"
        raise AnswerError(message)
    if field.maximum is not None and value > field.maximum:
        message = f"{field.code} cannot be above {field.maximum:g}"
        raise AnswerError(message)


def _option(field: FormField, value: JsonValue) -> None:
    if not field.options:
        return
    if not isinstance(value, str) or value not in field.options:
        message = f"{value!r} is not an option of {field.code}"
        raise AnswerError(message)
