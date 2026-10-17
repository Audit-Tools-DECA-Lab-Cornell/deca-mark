from dataclasses import dataclass, field
from typing import Final

from pydantic import BaseModel, JsonValue, ValidationError
from sqlalchemy.exc import (
    DBAPIError,
    InterfaceError,
    SQLAlchemyError,
)
from sqlalchemy.exc import (
    TimeoutError as PoolTimeoutError,
)

from fieldmaps_api.zone_error_details import safe_zone_details


@dataclass(frozen=True, slots=True)
class DatabaseFailure:
    code: str
    message: str
    status: int
    details: dict[str, JsonValue] = field(default_factory=dict[str, JsonValue])


class DriverState(BaseModel):
    sqlstate: str | None = None
    detail: str | None = None


DOMAIN_STATES: Final[dict[str, tuple[str, int, str]]] = {
    "FM001": ("limit_reached", 403, "Organization limit reached"),
    "FM002": ("sole_owner", 409, "The organization must retain an owner"),
    "FM003": ("invitation_invalid", 404, "Invitation not found"),
    "FM004": ("invitation_expired", 410, "Invitation expired"),
    "FM005": ("account_deleted", 403, "This account is no longer available"),
    "FM006": ("role_required", 403, "You do not have permission for this action"),
    "FM007": ("not_found", 404, "Record not found"),
    "FM008": ("conflict", 409, "The request conflicts with existing data"),
    "FM009": ("revision_conflict", 412, "The form draft revision has changed"),
    "FM010": ("precondition_required", 428, "A form draft revision is required"),
    "23505": ("conflict", 409, "The request conflicts with existing data"),
    "42501": ("role_required", 403, "You do not have permission for this action"),
    "ZB001": ("validation_failed", 422, "Zone validation failed"),
    "ZB002": ("revision_conflict", 412, "The draft revision has changed"),
    "ZB003": ("publication_conflict", 409, "The current package has changed"),
    "ZB004": ("idempotency_conflict", 409, "Request ID was already used for another request"),
    "ZB006": ("precondition_required", 428, "Publication preconditions are required"),
    "ZB007": (
        "conflict",
        409,
        "Publish a successor package with replacement form bindings before retiring this form",
    ),
}


def database_error(error: SQLAlchemyError) -> DatabaseFailure:
    """Classify driver SQLSTATE without returning database messages or parameters."""
    state = ""
    detail: str | None = None
    if isinstance(error, DBAPIError) and error.orig is not None:
        try:
            driver = DriverState.model_validate(error.orig, from_attributes=True)
            state, detail = driver.sqlstate or "", driver.detail
            if detail is None and error.orig.__cause__ is not None:
                cause = DriverState.model_validate(error.orig.__cause__, from_attributes=True)
                if cause.sqlstate == state:
                    detail = cause.detail
        except ValidationError:
            state = ""
    if state in DOMAIN_STATES:
        code, status, message = DOMAIN_STATES[state]
        details = (
            safe_zone_details(detail, conflict=state != "ZB001") if state.startswith("ZB") else {}
        )
        return DatabaseFailure(code, message, status, details)
    if state in {"23514", "23502", "23503"} or state.startswith("22"):
        return DatabaseFailure("validation_failed", "Request violates data constraints", 422)
    if (
        state.startswith(("08", "53"))
        or state in {"57P01", "40001", "40P01", "55P03", "57014"}
        or isinstance(error, (PoolTimeoutError, InterfaceError))
        or (isinstance(error, DBAPIError) and error.connection_invalidated)
    ):
        return DatabaseFailure("storage_unavailable", "Storage unavailable; retry later", 503)
    return DatabaseFailure("internal", "Internal server error", 500)
