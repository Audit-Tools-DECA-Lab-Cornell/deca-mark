from datetime import datetime
from typing import ClassVar, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, JsonValue, computed_field

from fieldmaps_api.form_preconditions import form_etag
from fieldmaps_api.tenancy_schemas import Input, Name, Slug

type VersionState = Literal["draft", "published", "retired"]


class FormVersionSummary(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    version_id: UUID
    code: str
    version: int
    state: VersionState
    title: str | None
    question_count: int
    created_at: datetime
    published_at: datetime | None
    revision: int

    @computed_field
    @property
    def etag(self) -> str:
        return form_etag(self.version_id, self.revision)


class FormSummary(BaseModel):
    """A form and its versions, newest first. Members see published and retired versions only."""

    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    form_id: UUID
    code: str
    name: str
    created_at: datetime
    versions: list[FormVersionSummary]


class FormVersionDetail(FormVersionSummary):
    form_id: UUID
    form_code: str
    form_name: str
    definition: dict[str, JsonValue]


class FormCreate(Input):
    """A new form and its first draft. The definition is checked as the collector will read it."""

    code: Slug
    name: Name
    definition: dict[str, JsonValue]


class DraftCreate(Input):
    """The next version of a form, as a draft: a copy of the newest version unless one is given."""

    definition: dict[str, JsonValue] | None = None


class DraftUpdate(Input):
    definition: dict[str, JsonValue]
