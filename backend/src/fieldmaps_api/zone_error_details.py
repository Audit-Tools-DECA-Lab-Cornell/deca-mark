"""Allowlisted zone details, independent of driver and framework error text."""

from typing import Annotated, ClassVar, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints, ValidationError

type ZoneIssueCode = Literal[
    "invalid_structure",
    "self_intersection",
    "invalid_topology",
    "zero_area",
    "outside_site",
    "interior_overlap",
    "duplicate_code",
    "duplicate_zone_id",
    "identity_conflict",
    "legacy_mapping_required",
    "unsupported_extent",
    "too_complex",
    "empty_zone_set",
    "point_outside_zone",
    "package_not_in_site",
    "package_not_ready",
    "zone_not_in_package",
    "form_not_in_package",
    "unversioned_package",
    "invalid_filter",
    "invalid_cursor",
    "export_scope_too_large",
]


class SafeZoneIssue(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="ignore")
    code: ZoneIssueCode
    zone_ids: Annotated[list[UUID], Field(max_length=250)] = Field(default_factory=list[UUID])
    path: Annotated[str, StringConstraints(max_length=512, pattern=r"^(?:/(?:[^~]|~[01])*)*$")] = ""

    def safe_value(self) -> dict[str, JsonValue]:
        return {
            "code": self.code,
            "zone_ids": [str(value) for value in self.zone_ids],
            "path": self.path,
            "message": self.code.replace("_", " ").capitalize(),
        }


class SafeZoneDetails(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="ignore")
    issues: Annotated[list[SafeZoneIssue], Field(max_length=1_000)] = Field(
        default_factory=list[SafeZoneIssue],
    )


class SafeConflictDetails(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(extra="ignore")
    draft_id: UUID | None = None
    current_package_id: UUID | None = None
    revision: Annotated[int, Field(strict=True, gt=0)] | None = None
    etag: Annotated[str, StringConstraints(max_length=100)] | None = None


def safe_zone_details(detail: str | None, *, conflict: bool = False) -> dict[str, JsonValue]:
    if detail is None or len(detail) > 256 * 1024:
        return {}
    try:
        if conflict:
            value = SafeConflictDetails.model_validate_json(detail)
            result = value.model_dump(mode="json", exclude_unset=True)
            result.pop("etag", None)
            if value.draft_id is not None and value.revision is not None:
                result["etag"] = f'"zone-draft:{value.draft_id}:{value.revision}"'
            return result
        value = SafeZoneDetails.model_validate_json(detail)
        return {"issues": [issue.safe_value() for issue in value.issues]}
    except ValidationError:
        return {}
