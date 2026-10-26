from datetime import datetime
from typing import Annotated, ClassVar, Literal, Self
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    field_validator,
    model_validator,
)

from fieldmaps_api.tenancy_schemas import Input, ProjectRole


class InvitationOptions(Input):
    email: (
        Annotated[
            str,
            StringConstraints(strip_whitespace=True, max_length=254, pattern=r"^[^\s@]+@[^\s@]+$"),
        ]
        | None
    ) = None
    max_uses: Annotated[int, Field(strict=True, ge=1, le=10000)] = 1
    expires_in_days: Annotated[int, Field(strict=True, ge=1, le=365)] = 14

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str | None) -> str | None:
        return value.lower() if value is not None else None


class OrgInvitationCreate(InvitationOptions):
    role: Literal["member", "admin"]


class ProjectInvitationCreate(InvitationOptions):
    role: ProjectRole


class Invitation(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    id: UUID
    organization_id: UUID
    project_id: UUID | None
    role: Literal["member", "admin", "manager", "observer", "viewer"]
    email: str | None
    max_uses: int
    use_count: int
    expires_at: datetime
    created_at: datetime
    revoked_at: datetime | None


class InvitationCreated(Invitation):
    token: str
    code: str
    email_delivery: Literal["queued", "not_requested", "unavailable"] = "not_requested"


class InvitationCredential(Input):
    token: Annotated[str, Field(min_length=1, max_length=256)] | None = None
    code: Annotated[str, Field(min_length=1, max_length=32)] | None = None

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return value.upper().replace("-", "") if value is not None else None

    @model_validator(mode="after")
    def exactly_one(self) -> Self:
        if (self.token is None) == (self.code is None):
            message = "Supply exactly one token or code"
            raise ValueError(message)
        return self


class InvitationPreview(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    organization_name: str
    project_name: str | None
    role: Literal["member", "admin", "manager", "observer", "viewer"]
    expires_at: datetime


class InvitationRedeemed(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    organization_id: UUID
    project_id: UUID | None
    role: Literal["member", "admin", "manager", "observer", "viewer"]
