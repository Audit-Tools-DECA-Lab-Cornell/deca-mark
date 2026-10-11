from collections import OrderedDict
from typing import TYPE_CHECKING
from uuid import UUID

import anyio
import orjson
from pydantic import JsonValue, TypeAdapter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.domain.packages import PackageError
from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.queries.sites import LEGACY_SELECTION, SITE_SELECT
from fieldmaps_api.services import zone_archives, zones
from fieldmaps_api.services.sites import read_package_archive
from fieldmaps_api.services.tenancy import project
from fieldmaps_api.zone_response_schemas import SiteV2

if TYPE_CHECKING:
    from sqlalchemy import Result

CURRENT_SELECTION = """k.id = coalesce((SELECT st.current_package_id FROM
  fieldmaps.site_zone_state st WHERE st.site_id=s.id),
 (SELECT l.id FROM fieldmaps.site_packages l WHERE l.site_id=s.id AND l.state='ready'
 AND l.manifest->'format'='1'::jsonb ORDER BY l.version DESC LIMIT 1))"""
V2_SELECT = SITE_SELECT.replace(LEGACY_SELECTION, CURRENT_SELECTION).replace(
    "'prepared_at', k.prepared_at)",
    "'prepared_at', k.prepared_at, 'format',(k.manifest->>'format')::integer,"
    "'zone_contract_version',k.zone_contract_version,'map_revision',"
    "CASE WHEN k.zone_contract_version=1 THEN k.version ELSE NULL END)",
)


async def metadata(session: AsyncSession, identifier: UUID) -> tuple[list[SiteV2], bool]:
    access = await project(session, identifier)
    result: Result[tuple[str]] = await session.execute(
        text(V2_SELECT + " ORDER BY s.name,s.id"), {"project": identifier}
    )
    sites: list[SiteV2] = []
    for row in result.scalars():
        value = TypeAdapter(dict[str, JsonValue]).validate_python(orjson.loads(row))
        value.update(
            current_package_id=None,
            map_revision=None,
            zone_contract_version=None,
            zone_editing_available=False,
        )
        site = SiteV2.model_validate(value)
        package = site.package
        sites.append(
            site.model_copy(
                update={
                    "current_package_id": package.package_id if package else None,
                    "map_revision": package.map_revision if package else None,
                    "zone_contract_version": package.zone_contract_version if package else None,
                }
            )
        )
    return sites, access.role == "manager"


class LegacyCapabilities:
    """Cache only immutable package structure; authorization is never cached."""

    def __init__(self, capacity: int = 64) -> None:
        self.capacity: int = capacity
        self.entries: OrderedDict[tuple[UUID, str], bool] = OrderedDict()
        self.lock: anyio.Lock = anyio.Lock()
        self.work: zones.ZoneWork = zones.ZoneWork()

    def get(self, key: tuple[UUID, str]) -> bool | None:
        value = self.entries.get(key)
        if value is not None:
            self.entries.move_to_end(key)
        return value

    async def inspect(
        self,
        sessions: async_sessionmaker[AsyncSession],
        user: UUID,
        identifier: UUID,
        key: tuple[UUID, str],
    ) -> bool:
        cached = self.get(key)
        if cached is not None:
            return cached
        async with self.work.slot(), self.lock:
            cached = self.get(key)
            if cached is not None:
                return cached
            async with zones.transaction(sessions, user) as session:
                await project(session, identifier)
                archive = await read_package_archive(session, identifier, key[0])
            try:
                base = await zone_archives.extract(archive)
            except PackageError:
                available = False
            else:
                async with zones.transaction(sessions, user) as session:
                    result: Result[tuple[bool]] = await session.execute(
                        text(
                            "SELECT fieldmaps_private.zone_ground_authoring_available("
                            "CAST(:ground AS jsonb))"
                        ),
                        {"ground": base.ground.model_dump_json()},
                    )
                    available = result.scalar_one()
            self.entries[key] = available
            while len(self.entries) > self.capacity:
                self.entries.popitem(last=False)
            return available


async def list_sites(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    identifier: UUID,
    *,
    enabled: bool,
    cache: LegacyCapabilities,
) -> list[SiteV2]:
    try:
        with anyio.fail_after(45):
            return await _list_sites(sessions, user, identifier, enabled=enabled, cache=cache)
    except TimeoutError as error:
        message = "Site discovery timed out; retry later"
        raise StorageUnavailableError(message) from error


async def _list_sites(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    identifier: UUID,
    *,
    enabled: bool,
    cache: LegacyCapabilities,
) -> list[SiteV2]:
    inspected: dict[tuple[UUID, str], bool] = {}
    async with zones.transaction(sessions, user) as session:
        initial, manager = await metadata(session, identifier)
        candidates = [
            site.package
            for site in initial
            if enabled
            and manager
            and site.package is not None
            and site.package.zone_contract_version is None
            and await available(session, identifier, site, legacy=True)
        ]
    if enabled and manager:
        for package in candidates:
            key = (package.package_id, package.archive_sha256)
            inspected[key] = await cache.inspect(sessions, user, identifier, key)
    # Refresh access, forms and package pointers after any archive work. A newly
    # selected legacy package is conservatively unavailable until its next read.
    async with zones.transaction(sessions, user) as session:
        current, manager = await metadata(session, identifier)
        if enabled and manager:
            for index, site in enumerate(current):
                package = site.package
                if package is None:
                    continue
                key = (package.package_id, package.archive_sha256)
                legacy = inspected[key] if key in inspected else cache.get(key)
                current[index] = site.model_copy(
                    update={
                        "zone_editing_available": await available(
                            session, identifier, site, legacy=legacy or False
                        )
                    }
                )
        return current


async def available(session: AsyncSession, identifier: UUID, site: SiteV2, *, legacy: bool) -> bool:
    result: Result[tuple[bool]] = await session.execute(
        text("SELECT fieldmaps_private.zone_authoring_available(:project,:site,:expected,:legacy)"),
        {
            "project": identifier,
            "site": site.site_id,
            "expected": site.current_package_id,
            "legacy": legacy,
        },
    )
    return result.scalar_one()
