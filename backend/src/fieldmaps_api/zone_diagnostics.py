from typing import ClassVar, Final

from pydantic import BaseModel, ConfigDict, Field, JsonValue
from starlette.types import Scope

ZONE_OPERATIONS: Final = frozenset(
    {
        "listSites",
        "createZoneDraft",
        "listZoneDrafts",
        "getZoneDraft",
        "replaceZoneDraft",
        "discardZoneDraft",
        "validateZoneDraft",
        "publishZoneDraft",
        "getHistoricalZones",
    }
)


class RouteOperation(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    operation_id: str | None = None


class SafeCounts(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    fieldmaps_zone_count: int | None = Field(default=None, ge=0)
    fieldmaps_zone_archive_bytes: int | None = Field(default=None, ge=0)


def metadata(scope: Scope) -> dict[str, JsonValue]:
    route = scope.get("route")
    if route is None:
        return {}
    operation = RouteOperation.model_validate(route, from_attributes=True).operation_id
    if operation is None:
        return {}
    result: dict[str, JsonValue] = {"operation": operation}
    if operation not in ZONE_OPERATIONS:
        return result
    counts = SafeCounts.model_validate(scope)
    if counts.fieldmaps_zone_count is not None:
        result["zone_count"] = counts.fieldmaps_zone_count
    if counts.fieldmaps_zone_archive_bytes is not None:
        result["archive_bytes"] = counts.fieldmaps_zone_archive_bytes
    return result
