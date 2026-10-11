from typing import Annotated, ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints

from fieldmaps_api.domain.packages import LayerName, PackageSubmission, ProjectFile
from fieldmaps_api.zone_draft_schemas import ChangeNote, ZoneCode


class ZoneIdentityMapping(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    source_feature_id: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    zone_id: UUID
    zone_code: ZoneCode


class PackageRequest(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    site_code: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    form_version: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    inventory_form_version: (
        Annotated[str, StringConstraints(min_length=1, max_length=100)] | None
    ) = None
    layers: dict[LayerName, JsonValue]
    project_file: ProjectFile | None = None
    request_id: UUID | None = None
    expected_current_package_id: UUID | None = None
    zone_identity_map: Annotated[tuple[ZoneIdentityMapping, ...] | None, Field(max_length=250)] = (
        None
    )
    change_note: ChangeNote | None = None

    def legacy(self) -> PackageSubmission:
        return PackageSubmission.model_validate(
            self.model_dump(
                exclude={
                    "request_id",
                    "expected_current_package_id",
                    "zone_identity_map",
                    "change_note",
                    "inventory_form_version",
                }
            )
        )
