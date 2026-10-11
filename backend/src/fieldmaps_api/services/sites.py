from uuid import UUID, uuid4

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.domain.packages import PackageError, PackageSubmission, prepare
from fieldmaps_api.errors import (
    ConflictError,
    NotFoundError,
    RoleRequiredError,
    ValidationFailedError,
)
from fieldmaps_api.queries import tenancy as tenancy_queries
from fieldmaps_api.repositories import sites
from fieldmaps_api.repositories import tenancy as tenancy_db
from fieldmaps_api.schemas import PackageDetail, PackageSummary
from fieldmaps_api.services.tenancy import project
from fieldmaps_api.site_schemas import Site, SiteCreate, SitePatch


async def prepare_package(
    session: AsyncSession,
    project_id: UUID,
    user_id: UUID,
    submission: PackageSubmission,
) -> PackageDetail:
    """Store preparation results, including blocked packages and their failed checks."""
    target = await sites.package_target(session, project_id, submission)
    if target is None:
        message = "Only a manager of this project, site and form may prepare a package"
        raise RoleRequiredError(message)
    if target.form_state != "published":
        # A device collects with the package's form, so it must be one that uploads accept.
        message = (
            f"{submission.form_version} is {target.form_state}; "
            "prepare the package with a published form version"
        )
        raise ValidationFailedError(message, field="form_version")
    try:
        prepared = prepare(submission)
    except PackageError as error:
        raise ValidationFailedError(str(error)) from error
    version = await sites.next_package_version(session, project_id, target.site_id)
    package_id = uuid4()
    package = sites.PackageWrite(
        package_id=package_id,
        project_id=project_id,
        user_id=user_id,
        target=target,
        version=version,
        state="blocked" if prepared.blocked else "ready",
        manifest_json=prepared.manifest.model_dump_json(),
        archive=prepared.archive,
        digest=prepared.archive_sha256,
        checks=prepared.checks,
    )
    try:
        await session.execute(
            text("SELECT fieldmaps_private.lock_legacy_package_site(:project,:site)"),
            {"project": project_id, "site": target.site_id},
        )
        await sites.insert_package(session, package)
    except IntegrityError as error:
        message = "Another package was prepared for this site; try again"
        raise ConflictError(message) from error
    return await get_package(session, project_id, package_id)


async def list_packages(
    session: AsyncSession, project_id: UUID, site_code: str | None, formats: tuple[int, ...] = (1,)
) -> list[PackageSummary]:
    await project(session, project_id)
    return await sites.list_packages(session, project_id, site_code, formats)


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


async def get_site(session: AsyncSession, project_id: UUID, code: str) -> Site:
    site = await sites.get_site(session, project_id, code)
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
    return await get_site(session, project_id, payload.code)


async def update_site(
    session: AsyncSession, project_id: UUID, code: str, payload: SitePatch
) -> Site:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    if not await sites.update_site(session, project_id, code, payload):
        message = "Site not found"
        raise NotFoundError(message)
    return await get_site(session, project_id, code)
