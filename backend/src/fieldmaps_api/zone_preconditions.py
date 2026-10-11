"""Strong draft preconditions without accepting HTTP list or wildcard syntax."""

import re
from typing import TYPE_CHECKING
from uuid import UUID

from fieldmaps_api.errors import DomainError

if TYPE_CHECKING:
    from pydantic import JsonValue

ETAG = re.compile(
    r'"zone-draft:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9][0-9]*)"'
)
MAX_REVISION = 9_223_372_036_854_775_807


def zone_etag(draft_id: UUID, revision: int) -> str:
    return f'"zone-draft:{draft_id}:{revision}"'


def require_zone_etag(value: str | None) -> tuple[UUID, int]:
    match = ETAG.fullmatch(value or "")
    if match is None:
        error = DomainError("precondition_required", "A strong draft If-Match is required", 428)
        raise error
    if len(match[2]) > len(str(MAX_REVISION)) or int(match[2]) > MAX_REVISION:
        error = DomainError("revision_conflict", "The draft revision has changed", 412)
        raise error
    return UUID(match[1]), int(match[2])


def assert_zone_etag(value: str | None, draft_id: UUID, revision: int | None = None) -> int:
    requested_id, requested_revision = require_zone_etag(value)
    if requested_id != draft_id or (revision is not None and requested_revision != revision):
        details: dict[str, JsonValue] = {"draft_id": str(draft_id)}
        if revision is not None:
            error = DomainError(
                "revision_conflict",
                "The draft revision has changed",
                412,
                {
                    "draft_id": str(draft_id),
                    "revision": revision,
                    "etag": zone_etag(draft_id, revision),
                },
            )
            raise error
        error = DomainError("revision_conflict", "The draft revision has changed", 412, details)
        raise error
    return requested_revision
