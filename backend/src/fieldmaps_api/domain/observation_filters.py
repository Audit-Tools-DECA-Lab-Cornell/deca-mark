"""Canonical filter identity and opaque mixed-direction keyset cursors."""

import base64
import binascii
from datetime import UTC
from hashlib import sha256
from typing import ClassVar
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, ValidationError, field_validator

from fieldmaps_api.errors import DomainError
from fieldmaps_api.observation_analysis_schemas import ObservationFilters


class Cursor(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    scope: str
    observed_at: AwareDatetime
    observation_id: UUID

    @field_validator("observed_at")
    @classmethod
    def utc_time(cls, value: AwareDatetime) -> AwareDatetime:
        try:
            return value.astimezone(UTC)
        except OverflowError:
            message = "Timestamp outside UTC range"
            raise ValueError(message) from None


def invalid_query(code: str = "invalid_filter") -> DomainError:
    return DomainError(
        "validation_failed",
        "Invalid observation query",
        422,
        {"issues": [{"code": code, "zone_ids": [], "path": "", "message": "Invalid query"}]},
    )


def filter_identity(project_id: UUID, filters: ObservationFilters) -> str:
    canonical = ObservationFilters.model_validate(
        filters.model_dump(include=set(ObservationFilters.model_fields))
    )
    normalized = canonical.model_copy(
        update={
            "observed_from": None
            if canonical.observed_from is None
            else canonical.observed_from.astimezone(UTC),
            "observed_before": None
            if canonical.observed_before is None
            else canonical.observed_before.astimezone(UTC),
        }
    )
    return sha256(f"{project_id}:{normalized.model_dump_json()}".encode()).hexdigest()


def decode_cursor(
    value: str | None, project_id: UUID, filters: ObservationFilters
) -> Cursor | None:
    if value is None:
        return None
    try:
        decoded = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
        cursor = Cursor.model_validate_json(decoded)
    except (binascii.Error, ValidationError, ValueError):
        code = "invalid_cursor"
        raise invalid_query(code) from None
    if cursor.scope != filter_identity(project_id, filters):
        code = "invalid_cursor"
        raise invalid_query(code)
    return cursor


def encode_cursor(
    project_id: UUID,
    filters: ObservationFilters,
    *,
    observed_at: AwareDatetime,
    observation_id: UUID,
) -> str:
    data = Cursor(
        scope=filter_identity(project_id, filters),
        observed_at=observed_at,
        observation_id=observation_id,
    )
    return base64.urlsafe_b64encode(data.model_dump_json().encode()).decode().rstrip("=")
