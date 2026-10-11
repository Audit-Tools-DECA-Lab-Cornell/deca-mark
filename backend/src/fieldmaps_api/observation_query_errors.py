"""Safe query validation issues never include submitted UUIDs or tenant identities."""

from collections.abc import Sequence
from typing import Protocol

from pydantic import JsonValue


class LocatedIssue(Protocol):
    @property
    def loc(self) -> tuple[str | int, ...]: ...


def query_details(issues: Sequence[LocatedIssue]) -> dict[str, JsonValue]:
    code = "invalid_cursor" if any("cursor" in issue.loc for issue in issues) else "invalid_filter"
    return {"issues": [{"code": code, "zone_ids": [], "path": "", "message": "Invalid query"}]}
