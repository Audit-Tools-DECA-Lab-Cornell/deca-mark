"""Operator preflight only: recognise a fields-only form definition. The API never imports this.

The one remaining place that knows the fields-only format is the interim schema-2 migration of
hosted rows before OPS-19 (docs/decisions/0002). The API neither reads, serves nor validates
answers against these definitions; OPS-19's reset removes the hosted rows, and this module goes
with the preflight afterwards.
"""

from typing import ClassVar, Literal

from pydantic import BaseModel, ConfigDict, Field

FieldType = Literal["text", "integer", "number", "choice", "multi-choice", "boolean"]


class FieldsOnlyField(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")

    code: str = Field(min_length=1, max_length=100)
    type: FieldType
    required: bool = False
    minimum: float | None = None
    maximum: float | None = None
    maxLength: int | None = None  # noqa: N815 — the stored definitions spell it this way.
    options: list[str] = Field(default_factory=list[str])


class FieldsOnlyDefinition(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="ignore")

    fields: list[FieldsOnlyField]
