from datetime import UTC, datetime
from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    JsonValue,
    field_validator,
    model_validator,
)

from fieldmaps_api.domain.forms import StoredFormDefinition
from fieldmaps_api.domain.packages import PreparationCheck

#: A site or form version is named by its code within a project, which is what the collector
#: carries and what an export column is keyed by.
Code = Annotated[str, Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9][\w.-]*$")]

MAX_ANSWERS = 200


class ObservationUpload(BaseModel):
    """One observation, as the collector sends it.

    The envelope is fixed; everything beside it is an answer. That is already the shape the
    collector puts on the wire — it sends `people` and `notes` at the top level — so opening the
    API to a second form changed nothing about the request, only about what validates it. The
    answers are checked against the form version's own field list, so a misspelled key is still
    refused, now by the instrument rather than by a hard-coded pair.
    """

    model_config: ClassVar[ConfigDict] = ConfigDict(
        frozen=True, extra="allow", str_strip_whitespace=True
    )

    site_id: Code
    form_version: Code
    coordinates: tuple[
        Annotated[float, Field(ge=-180, le=180, allow_inf_nan=False)],
        Annotated[float, Field(ge=-90, le=90, allow_inf_nan=False)],
    ]
    observer: Annotated[str, Field(min_length=1, max_length=12)]
    observed_at: AwareDatetime
    #: The round the record belongs to (D26). Optional, so practice uploads keep their shape; the
    #: fingerprint includes these only when they are sent, so a retried older upload still matches.
    zone: Code | None = None
    round_type: Literal["standard", "reliability", "inventory"] | None = None
    first_round: bool | None = None
    placement: Literal["hand", "zone"] | None = None

    @field_validator("observed_at")
    @classmethod
    def normalize_capture_time(cls, value: datetime) -> datetime:
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def coherent_round(self) -> "ObservationUpload":
        """Accept no round at all (practice) or a whole, consistent one."""
        if self.round_type is None:
            if (self.zone, self.first_round, self.placement) != (None, None, None):
                message = "zone, first_round and placement are sent with a round_type"
                raise ValueError(message)
            return self
        if self.zone is None or self.placement is None:
            message = "A round's record names its zone and placement"
            raise ValueError(message)
        if self.round_type == "inventory":
            if self.placement != "zone" or self.first_round is not None:
                message = "An inventory belongs to its whole zone: placement zone, no first_round"
                raise ValueError(message)
        elif self.placement != "hand" or self.first_round is None:
            message = "A play event is placed by hand and says whether it opens a round"
            raise ValueError(message)
        return self

    @model_validator(mode="after")
    def limit_answers(self) -> "ObservationUpload":
        if len(self.model_extra or {}) > MAX_ANSWERS:
            message = f"An observation may carry up to {MAX_ANSWERS} answers"
            raise ValueError(message)
        return self

    @property
    def answers(self) -> dict[str, JsonValue]:
        extra: dict[str, JsonValue] = dict(self.model_extra or {})
        return extra


class UploadReceipt(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    observation_id: UUID
    project_id: UUID
    user_id: UUID
    accepted_revision: Literal[1] = 1
    received_at: AwareDatetime


class StoredObservation(BaseModel):
    """A direct record read, including the historical form needed to label its answers."""

    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    observation_id: UUID
    project_id: UUID
    observer: str
    coordinates: tuple[float, float]
    answers: dict[str, JsonValue]
    observed_at: AwareDatetime
    revision: int

    site_code: str
    site_name: str
    form_version: str
    received_at: AwareDatetime
    zone: str | None
    round_type: Literal["standard", "reliability", "inventory"]
    first_round: bool | None
    placement: Literal["hand", "zone"] | None


class ObservationQuery(BaseModel):
    """Which records to list: one site's, one round type's, or those received since a time."""

    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")

    site: Annotated[str, Field(max_length=100)] | None = None
    round_type: Literal["standard", "reliability", "inventory"] | None = None
    since: AwareDatetime | None = None
    limit: Annotated[int, Field(ge=1, le=500)] = 500


class ObservationRow(BaseModel):
    """One observation as the workspace lists it, with its site, form version and round."""

    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    observation_id: UUID
    observer: str
    observed_at: AwareDatetime
    received_at: AwareDatetime
    coordinates: tuple[float, float]
    site_code: str
    site_name: str
    form_version: str
    zone: str | None
    #: Standard when uploaded without a round: a play event outside any reliability round.
    round_type: Literal["standard", "reliability", "inventory"]
    first_round: bool | None
    placement: Literal["hand", "zone"] | None
    answers: dict[str, JsonValue]
    revision: int


class ProjectAccess(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    project_id: UUID
    organization_id: UUID
    name: str
    role: Literal["observer", "manager", "viewer"]


class PackageSummary(BaseModel):
    """A prepared package as a list shows it. The archive itself is fetched separately."""

    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)

    package_id: UUID
    site_code: str
    form_version: str
    version: int
    state: Literal["ready", "blocked"]
    archive_bytes: int
    archive_sha256: str
    prepared_at: AwareDatetime
    format: Literal[1, 2] = 1
    zone_contract_version: Literal[1] | None = None
    map_revision: int | None = None


class PackageDetail(PackageSummary):
    manifest: JsonValue
    checks: list[PreparationCheck]


class UploadTarget(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    organization_id: UUID
    site_id: UUID
    form_version_id: UUID
    definition: StoredFormDefinition
    #: Uploads only ever resolve published or retired versions; a package target reports its state.
    form_state: Literal["draft", "published", "retired"] = "published"
