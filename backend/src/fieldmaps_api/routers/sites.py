from enum import IntEnum
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Path, Query, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.domain.project_import import ProjectImportRequest, ProjectImportResult
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.queries import tenancy as tenancy_queries
from fieldmaps_api.repositories import tenancy as tenancy_db
from fieldmaps_api.schemas import PackageDetail, PackageSummary
from fieldmaps_api.services import sites as site_service
from fieldmaps_api.services import zone_publication
from fieldmaps_api.services import zones as zone_service
from fieldmaps_api.services.project_import import import_project
from fieldmaps_api.services.sites import (
    get_package,
    list_packages,
    read_package_archive,
)
from fieldmaps_api.site_schemas import Site, SiteCreate, SitePatch
from fieldmaps_api.zone_import_schemas import PackageRequest

type SiteCode = Annotated[str, Path(min_length=1, max_length=100)]


class SupportedFormat(IntEnum):
    legacy = 1
    zones = 2


def create_router(
    sessions: async_sessionmaker[AsyncSession],
    authenticate: Authentication,
    *,
    zone_enabled: bool = False,
    work: zone_service.ZoneWork | None = None,
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)
    work = work or zone_service.ZoneWork()

    @router.get("/v1/projects/{project_id}/sites", operation_id="listSites")
    async def site_list(
        project_id: UUID, user_id: Annotated[UUID, Depends(authenticate)]
    ) -> list[Site]:
        """List the project's sites with their current package, zones and observation count."""
        async with user_transaction(sessions, user_id) as session:
            return await site_service.list_sites(session, project_id)

    @router.post("/v1/projects/{project_id}/sites", status_code=201, operation_id="createSite")
    async def site_create(
        project_id: UUID,
        payload: SiteCreate,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> Site:
        """Add a site to the project. Its map arrives later, as a package prepared for its code."""
        async with user_transaction(sessions, user_id) as session:
            return await site_service.create_site(session, project_id, payload)

    @router.get("/v1/projects/{project_id}/sites/{site_code}", operation_id="getSite")
    async def site_detail(
        project_id: UUID,
        site_code: SiteCode,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> Site:
        async with user_transaction(sessions, user_id) as session:
            return await site_service.get_site(session, project_id, site_code)

    @router.patch("/v1/projects/{project_id}/sites/{site_code}", operation_id="updateSite")
    async def site_update(
        project_id: UUID,
        site_code: SiteCode,
        payload: SitePatch,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> Site:
        async with user_transaction(sessions, user_id) as session:
            return await site_service.update_site(session, project_id, site_code, payload)

    @router.post("/v1/projects/{project_id}/packages/import", operation_id="importQgisProject")
    async def import_qgis(
        project_id: UUID,
        submission: ProjectImportRequest,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> ProjectImportResult:
        """Convert supplied QGIS sources for review without saving a package."""
        async with user_transaction(sessions, user_id) as session:
            await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
        return await import_project(submission)

    @router.post(
        "/v1/projects/{project_id}/packages",
        status_code=201,
        operation_id="preparePackage",
    )
    async def prepare(
        project_id: UUID,
        submission: PackageRequest,
        response: Response,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> PackageDetail:
        """Prepare a site package from a QGIS export, and record what every check found."""
        async with work.slot():
            result, status = await zone_publication.prepare_submission(
                sessions, user_id, project_id, submission, enabled=zone_enabled
            )
        response.status_code = status
        return result

    @router.get(
        "/v1/projects/{project_id}/packages",
        operation_id="listPackages",
    )
    async def packages(
        project_id: UUID,
        user_id: Annotated[UUID, Depends(authenticate)],
        site: Annotated[str | None, Query(max_length=100)] = None,
        supported_format: Annotated[list[SupportedFormat] | None, Query()] = None,
    ) -> list[PackageSummary]:
        async with user_transaction(sessions, user_id) as session:
            return await list_packages(
                session,
                project_id,
                site,
                tuple(int(value) for value in supported_format)
                if supported_format is not None
                else (1,),
            )

    @router.get(
        "/v1/projects/{project_id}/packages/{package_id}",
        operation_id="getPackage",
    )
    async def package(
        project_id: UUID,
        package_id: UUID,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> PackageDetail:
        async with user_transaction(sessions, user_id) as session:
            return await get_package(session, project_id, package_id)

    @router.get(
        "/v1/projects/{project_id}/packages/{package_id}/archive",
        operation_id="downloadPackageArchive",
        response_class=Response,
        response_model=None,
        responses={
            200: {
                "description": "Prepared package archive",
                "content": {"application/zip": {"schema": {"type": "string", "format": "binary"}}},
                "headers": {
                    "ETag": {"schema": {"type": "string"}, "description": "Quoted SHA-256 digest"},
                    "Content-Disposition": {"schema": {"type": "string"}},
                },
            }
        },
    )
    async def archive(
        project_id: UUID,
        package_id: UUID,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> Response:
        """Hand over the package itself, for a device about to carry it into the field."""
        async with user_transaction(sessions, user_id) as session:
            payload, digest = await read_package_archive(session, project_id, package_id)
        return Response(
            payload,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="package-{package_id}.zip"',
                # The digest the manifest was stored with, so a device can verify what it fetched.
                "ETag": f'"{digest}"',
            },
        )

    return router
