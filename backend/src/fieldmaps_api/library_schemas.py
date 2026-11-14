"""Library wire types. These do not add write routes or change form schema 2."""

from datetime import datetime
from typing import Annotated, Literal, Self
from uuid import UUID

from pydantic import Field, computed_field, model_validator

from fieldmaps_api.domain.form_definition import (
    MAX_SAFE_INTEGER,
    Condition,
    DateTimeConfig,
    DynamicFrom,
    Option,
)
from fieldmaps_api.tenancy_schemas import Input

type Level = Literal["universal", "organization", "project", "site"]
type Section = Literal["Child", "Social", "Play", "Setting", "Climate", "Inventory", "Record"]
type Revision = Annotated[int, Field(strict=True, ge=1, le=MAX_SAFE_INTEGER)]
type Label = Annotated[str, Field(min_length=1, max_length=200)]
type Code = Annotated[str, Field(pattern=r"^[A-Za-z][A-Za-z0-9_-]{0,99}$")]
type Group = Annotated[str, Field(min_length=1, max_length=100)]


class LibrarySettings(Input):
    """Canonical settings; dependency question strings identify variable UUIDs in storage."""

    label: Label
    export_column: Annotated[str, Field(min_length=1, max_length=100)] = Field(alias="exportColumn")
    kind: Literal["one", "many", "text", "number", "dateTime"]
    source: Annotated[str, Field(min_length=1, max_length=2000)]
    hint: Annotated[str, Field(min_length=1, max_length=2000)] | None = None
    options: Annotated[list[Option], Field(max_length=200)] = Field(default_factory=list)
    required: bool = False
    columns: Annotated[int, Field(ge=1, le=4)] = 1
    role: Literal["observer"] | None = None
    number_mode: Literal["integer", "decimal"] | None = Field(default=None, alias="numberMode")
    value_source: Literal["manual", "accountId", "observerCode", "captureTime"] | None = Field(
        default=None, alias="valueSource"
    )
    date_time: DateTimeConfig | None = Field(default=None, alias="dateTime")
    depends_on: Condition | None = Field(default=None, alias="dependsOn")
    opened_by: str | None = Field(default=None, alias="openedBy")
    dynamic_from: DynamicFrom | None = Field(default=None, alias="dynamicFrom")
    placeholder: str | None = None
    rows: Annotated[int, Field(ge=1, le=8)] | None = None
    max_length: Annotated[int, Field(ge=1, le=MAX_SAFE_INTEGER)] | None = Field(
        default=None, alias="maxLength"
    )
    min: Annotated[int | float, Field(allow_inf_nan=False)] | None = None
    max: Annotated[int | float, Field(allow_inf_nan=False)] | None = None
    protocol_flag: str | None = Field(default=None, alias="protocolFlag")
    options_pending: str | None = Field(default=None, alias="optionsPending")

    @model_validator(mode="after")
    def omitted_not_null(self) -> Self:
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                message = f"{name} must be omitted rather than null"
                raise ValueError(message)
        return self


class Variable(Input):
    id: UUID
    level: Level
    organization_id: UUID | None
    project_id: UUID | None
    site_id: UUID | None
    code: Code
    group: Group
    section: Section
    settings: LibrarySettings
    revision: Revision
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def scope_shape(self) -> Self:
        expected = {
            "universal": (False, False, False),
            "organization": (True, False, False),
            "project": (True, True, False),
            "site": (True, True, True),
        }
        if (
            tuple(x is not None for x in (self.organization_id, self.project_id, self.site_id))
            != expected[self.level]
        ):
            message = "Ownership must match the library level"
            raise ValueError(message)
        return self

    @computed_field
    @property
    def etag(self) -> str:
        return f'"library-variable:{self.id}:{self.revision}"'


class LibraryContext(Input):
    organization_id: UUID
    project_id: UUID | None = None


class LibrarySite(Input):
    id: UUID
    name: str
    code: str


class LibraryEntry(Input):
    variable: Variable
    used_in_forms: Annotated[int, Field(ge=0)]
    can_edit: bool


class Library(Input):
    context: LibraryContext
    sites: list[LibrarySite]
    variables: list[LibraryEntry]


class VariableLink(Input):
    id: UUID
    code: str
    label: str
    level: Level
    organization_id: UUID | None
    project_id: UUID | None
    site_id: UUID | None


class TemplateLink(Input):
    id: UUID
    name: str
    level: Literal["universal", "organization"]
    organization_id: UUID | None


class UsageVersion(Input):
    version_id: UUID
    version_code: str
    version: int
    state: Literal["draft", "published", "retired"]
    title: str | None


class UsageForm(Input):
    form_id: UUID
    form_code: str
    name: str
    project_id: UUID
    project_code: str
    organization_id: UUID
    organization_slug: str
    versions: list[UsageVersion]


class VariableUsage(Input):
    can_edit: bool
    used_in_forms: Annotated[int, Field(ge=0)]
    forms: list[UsageForm]
    templates: list[TemplateLink]
    dependent_variables: list[VariableLink]


class VariableReplace(Input):
    group: Group
    section: Section
    settings: LibrarySettings


class VariableCreate(VariableReplace):
    client_key: Annotated[str, Field(pattern=r"^[a-z][a-z0-9_]{0,31}$")]
    level: Literal["organization", "project", "site"]
    site_id: UUID | None = None
    code: Code


class VariablesCreate(Input):
    items: Annotated[list[VariableCreate], Field(min_length=1, max_length=2)]


class TemplateBody(Input):
    name: Label
    description: Annotated[str, Field(max_length=1000)]
    round: Literal["standard", "inventory"]
    variable_ids: Annotated[list[UUID], Field(min_length=1, max_length=300)]


type LibraryErrorCode = Literal[
    "library_code_conflict", "library_invalid", "library_dependency_conflict", "library_in_use"
]


class LibraryIssue(Input):
    kind: Literal[
        "invalid_settings",
        "reference_unavailable",
        "reference_scope",
        "reference_cycle",
        "reference_type",
        "option_missing",
        "parent_missing",
        "parent_order",
        "duplicate_variable",
        "duplicate_column",
        "immutable_field",
    ]
    path: list[str | int]
    variable_ids: list[UUID] | None = None
    template_id: UUID | None = None
    option_code: str | None = None
    data_column: str | None = None


class LibraryBlockers(Input):
    issues: list[LibraryIssue] = Field(default_factory=list)
    variables: list[VariableLink] = Field(default_factory=list)
    templates: list[TemplateLink] = Field(default_factory=list)
