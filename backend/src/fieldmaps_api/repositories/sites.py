from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.queries import sites as queries
from fieldmaps_api.schemas import PackageDetail, PackageSummary
from fieldmaps_api.site_schemas import Site, SiteCreate, SitePatch

if TYPE_CHECKING:
    from sqlalchemy import Result

async def list_packages(
    session: AsyncSession, project_id: UUID, site_id: UUID
) -> list[PackageSummary]:
    result: Result[tuple[str]] = await session.execute(
        queries.PACKAGES, {"project": project_id, "site": site_id}
    )
    return [PackageSummary.model_validate_json(row) for row in result.scalars()]


async def get_package(
    session: AsyncSession, project_id: UUID, package_id: UUID
) -> PackageDetail | None:
    result: Result[tuple[str]] = await session.execute(
        queries.PACKAGE_DETAIL, {"project": project_id, "id": package_id}
    )
    data = result.scalar_one_or_none()
    return None if data is None else PackageDetail.model_validate_json(data)


async def read_package_archive(
    session: AsyncSession, project_id: UUID, package_id: UUID
) -> tuple[bytes, str, str] | None:
    result: Result[tuple[bytes, str, str]] = await session.execute(
        queries.PACKAGE_ARCHIVE, {"project": project_id, "id": package_id}
    )
    row = result.one_or_none()
    return None if row is None else row.tuple()


async def list_sites(session: AsyncSession, project_id: UUID) -> list[Site]:
    result: Result[tuple[str]] = await session.execute(queries.SITES, {"project": project_id})
    return [Site.model_validate_json(row) for row in result.scalars()]


async def get_site(session: AsyncSession, project_id: UUID, site_id: UUID) -> Site | None:
    result: Result[tuple[str]] = await session.execute(
        queries.SITE, {"project": project_id, "site": site_id}
    )
    data = result.scalar_one_or_none()
    return None if data is None else Site.model_validate_json(data)


async def project_organization(session: AsyncSession, project_id: UUID) -> UUID | None:
    result: Result[tuple[UUID]] = await session.execute(
        queries.PROJECT_ORGANIZATION, {"project": project_id}
    )
    return result.scalar_one_or_none()


async def site_id_by_code(session: AsyncSession, project_id: UUID, code: str) -> UUID | None:
    result: Result[tuple[UUID]] = await session.execute(
        queries.SITE_BY_CODE, {"project": project_id, "code": code}
    )
    return result.scalar_one_or_none()


async def insert_site(
    session: AsyncSession, project_id: UUID, organization_id: UUID, payload: SiteCreate
) -> None:
    await session.execute(
        queries.CREATE_SITE,
        {
            "id": uuid4(),
            "organization": organization_id,
            "project": project_id,
            "code": payload.code,
            "name": payload.name,
            "description": payload.description,
        },
    )


async def update_site(
    session: AsyncSession, project_id: UUID, site_id: UUID, payload: SitePatch
) -> bool:
    result: Result[tuple[UUID]] = await session.execute(
        queries.PATCH_SITE,
        {
            "project": project_id,
            "site": site_id,
            "name": payload.name,
            "description": payload.description,
            "has_description": "description" in payload.model_fields_set,
        },
    )
    return result.scalar_one_or_none() is not None
