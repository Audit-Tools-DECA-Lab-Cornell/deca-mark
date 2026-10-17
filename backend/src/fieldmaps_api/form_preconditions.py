"""Strong form preconditions bind both the draft identity and its revision."""

import re
from uuid import UUID

from fieldmaps_api.errors import DomainError

ETAG = re.compile(
    r'"form-draft:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):([1-9][0-9]*)"'
)
MAX_REVISION = 9_223_372_036_854_775_807


def form_etag(version_id: UUID, revision: int) -> str:
    return f'"form-draft:{version_id}:{revision}"'


def require_form_etag(value: str | None) -> tuple[UUID, int]:
    match = ETAG.fullmatch(value or "")
    if match is None:
        error = DomainError(
            "precondition_required", "A strong form draft If-Match is required", 428
        )
        raise error
    if len(match[2]) > len(str(MAX_REVISION)) or int(match[2]) > MAX_REVISION:
        raise revision_conflict()
    return UUID(match[1]), int(match[2])


def revision_conflict() -> DomainError:
    return DomainError(
        "revision_conflict", "The form draft changed; reload and review it again", 412
    )
