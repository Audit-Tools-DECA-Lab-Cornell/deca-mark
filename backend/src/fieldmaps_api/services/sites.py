from uuid import UUID

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.errors import (
    ConflictError,
    NotFoundError,
)
from fieldmaps_api.queries import tenancy as tenancy_queries
from fieldmaps_api.repositories import sites
from fieldmaps_api.repositories import tenancy as tenancy_db
from fieldmaps_api.schemas import PackageDetail, PackageSummary
from fieldmaps_api.services.tenancy import project
from fieldmaps_api.site_schemas import Site, SiteCreate, SitePatch


async def list_packages(
    session: AsyncSession, project_id: UUID, site_id: UUID
) -> list[PackageSummary]:
    await project(session, project_id)
    return await sites.list_packages(session, project_id, site_id)


async def get_package(session: AsyncSession, project_id: UUID, package_id: UUID) -> PackageDetail:
    package = await sites.get_package(session, project_id, package_id)
    if package is None:
        message = "Package not found"
        raise NotFoundError(message)
    return package


async def read_package_archive(
    session: AsyncSession, project_id: UUID, package_id: UUID
) -> tuple[bytes, str]:
    result = await sites.read_package_archive(session, project_id, package_id)
    if result is None:
        message = "Package not found"
        raise NotFoundError(message)
    archive, digest, state = result
    if state != "ready":
        message = "This package was blocked during preparation and cannot be downloaded"
        raise ConflictError(message)
    return archive, digest


async def list_sites(session: AsyncSession, project_id: UUID) -> list[Site]:
    await project(session, project_id)
    return await sites.list_sites(session, project_id)


async def get_site(session: AsyncSession, project_id: UUID, site_id: UUID) -> Site:
    site = await sites.get_site(session, project_id, site_id)
    if site is None:
        message = "Site not found"
        raise NotFoundError(message)
    return site


async def create_site(session: AsyncSession, project_id: UUID, payload: SiteCreate) -> Site:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    organization_id = await sites.project_organization(session, project_id)
    if organization_id is None:
        message = "Project not found"
        raise NotFoundError(message)
    try:
        async with session.begin_nested():
            await sites.insert_site(session, project_id, organization_id, payload)
    except IntegrityError as error:
        message = f'This project already has a site with the code "{payload.code}"'
        raise ConflictError(message) from error
    site_id = await sites.site_id_by_code(session, project_id, payload.code)
    if site_id is None:
        message = "Site not found after creation"
        raise NotFoundError(message)
    return await get_site(session, project_id, site_id)


async def update_site(
    session: AsyncSession, project_id: UUID, site_id: UUID, payload: SitePatch
) -> Site:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    if not await sites.update_site(session, project_id, site_id, payload):
        message = "Site not found"
        raise NotFoundError(message)
    return await get_site(session, project_id, site_id)
