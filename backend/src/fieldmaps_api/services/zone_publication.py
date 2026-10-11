from dataclasses import dataclass
from uuid import UUID, uuid4

import orjson
from fastapi.exceptions import RequestValidationError
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.domain.packages import PackageError
from fieldmaps_api.domain.zone_archive_jobs import ImportJob, PublishJob
from fieldmaps_api.domain.zone_package_schemas import PackageIdentity, PreparedZonePackage
from fieldmaps_api.errors import DomainError, RoleRequiredError
from fieldmaps_api.queries import zones as q
from fieldmaps_api.repositories import zones as db
from fieldmaps_api.schemas import PackageDetail
from fieldmaps_api.services import zone_archives, zones
from fieldmaps_api.services.sites import get_package, prepare_package, read_package_archive
from fieldmaps_api.zone_draft_schemas import DraftPublish
from fieldmaps_api.zone_import_schemas import PackageRequest
from fieldmaps_api.zone_response_schemas import ImportValidation, PackageForms, Publication


@dataclass(frozen=True, slots=True)
class PublicationRequest:
    project: UUID
    site: UUID
    request: UUID
    expected: UUID
    draft: UUID | None
    revision: int | None
    import_body: str | None = None

    def parameters(self, prepared: PreparedZonePackage | None) -> db.Parameters:
        return {
            "project": self.project,
            "site": self.site,
            "request": self.request,
            "expected": self.expected,
            "draft": self.draft,
            "revision": self.revision,
            "import_body": self.import_body,
            "package": prepared.manifest.package_id if prepared else None,
            "version": prepared.manifest.package_version if prepared else None,
            "manifest": prepared.manifest.model_dump_json() if prepared else None,
            "layer": prepared.zone_layer.model_dump_json() if prepared else None,
            "archive": prepared.archive if prepared else None,
            "checks": orjson.dumps([c.model_dump(mode="json") for c in prepared.checks]).decode()
            if prepared
            else None,
            "layer_bytes": prepared.zone_layer_bytes if prepared else None,
        }


async def finalize(
    session: AsyncSession, request: PublicationRequest, prepared: PreparedZonePackage | None
) -> tuple[Publication, bool]:
    identifier, replayed = await db.finalize(session, request.parameters(prepared))
    package = await get_package(session, request.project, identifier)
    return Publication(site_id=request.site, draft_id=request.draft, package=package), replayed


async def replay(
    session: AsyncSession, request: PublicationRequest
) -> tuple[Publication, bool] | None:
    found = await db.identifier(
        session,
        q.REPLAY,
        {
            "project": request.project,
            "request": request.request,
            "operation": "draft_publish" if request.draft else "package_import",
        },
    )
    return await finalize(session, request, None) if found is not None else None


def require_enabled(*, enabled: bool) -> None:
    if not enabled:
        message = "unsupported_operation"
        raise DomainError(message, "Zone publication is not enabled", 503)


def require_ready(validation: ImportValidation) -> None:
    if not validation.ready:
        message = "validation_failed"
        raise DomainError(
            message,
            "Zone publication validation failed",
            422,
            {"issues": [i.model_dump(mode="json") for i in validation.issues]},
        )


async def publish(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    reference: zones.DraftReference,
    payload: DraftPublish,
    *,
    enabled: bool,
) -> tuple[Publication, bool]:
    project, site, identifier, etag = (
        reference.project,
        reference.site,
        reference.identifier,
        reference.etag,
    )
    async with zones.transaction(sessions, user) as session:
        current = await zones.get(session, project, site, identifier)
        revision = zones.check_etag(etag, current)
        request = PublicationRequest(
            project,
            site,
            payload.request_id,
            payload.expected_current_package_id,
            identifier,
            revision,
        )
        previous = await replay(session, request)
        if previous is not None:
            return previous
        require_enabled(enabled=enabled)
        scope = await db.scope(session, project, site)
        if (
            scope.current_package_id != payload.expected_current_package_id
            or current.base_package_id != scope.current_package_id
        ):
            msg = "publication_conflict"
            raise DomainError(
                msg,
                "The current package has changed",
                409,
                {
                    "current_package_id": str(scope.current_package_id)
                    if scope.current_package_id
                    else None
                },
            )
        validation = await zones.validate(session, reference)
        require_ready(ImportValidation.model_validate(validation.model_dump()))
        scope = await db.scope(session, project, site)
        archive = await read_package_archive(session, project, current.base_package_id)
        identity = PackageIdentity(site, uuid4(), scope.next_version, scope.code)
    try:
        prepared = await zone_archives.prepare(
            PublishJob(
                identity=identity,
                forms=current.forms,
                validation=ImportValidation.model_validate(validation.model_dump()),
            ),
            archive,
        )
    except PackageError as error:
        message = "invalid_structure"
        raise zones.issue(message) from error
    async with zones.transaction(sessions, user) as session:
        return await finalize(session, request, prepared)


async def import_package(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    project: UUID,
    payload: PackageRequest,
    *,
    enabled: bool,
) -> tuple[Publication, bool] | None:
    async with zones.transaction(sessions, user) as session:
        site = await db.identifier(
            session, q.SITE_BY_CODE, {"project": project, "code": payload.site_code}
        )
        if site is None:
            msg = "Manager access to the site and form is required"
            raise RoleRequiredError(msg)
        scope = await db.scope(session, project, site)
        if not scope.managed:
            return None
        if (
            "expected_current_package_id" in payload.model_fields_set
            and payload.expected_current_package_id is None
        ):
            msg_0 = "invalid_structure"
            raise zones.issue(msg_0)
        if (
            payload.request_id is None
            or payload.expected_current_package_id is None
            or payload.zone_identity_map is None
            or payload.change_note is None
        ):
            message = "precondition_required"
            raise DomainError(
                message,
                "Managed imports require current package, request ID and identity mapping",
                428,
            )
        request = PublicationRequest(
            project,
            scope.site_id,
            payload.request_id,
            payload.expected_current_package_id,
            None,
            None,
            payload.model_dump_json(
                exclude={"inventory_form_version"}
                if "inventory_form_version" not in payload.model_fields_set
                else None
            ),
        )
        previous = await replay(session, request)
        if previous is not None:
            return previous
        require_enabled(enabled=enabled)
        validation = ImportValidation.model_validate_json(
            await db.invoke(
                session,
                q.IMPORT_VALIDATE,
                {
                    "project": project,
                    "site": scope.site_id,
                    "expected": payload.expected_current_package_id,
                    "body": request.import_body,
                },
            )
        )
        require_ready(validation)
        if scope.current_package_id is None:
            message = "unversioned_package"
            raise zones.issue(message)
        forms = PackageForms.model_validate_json(
            await db.invoke(
                session,
                q.IMPORT_FORMS,
                {
                    "project": project,
                    "site": scope.site_id,
                    "expected": payload.expected_current_package_id,
                    "body": request.import_body,
                },
            )
        )
        identity = PackageIdentity(scope.site_id, uuid4(), scope.next_version, scope.code)
    try:
        prepared = await zone_archives.prepare(
            ImportJob(identity=identity, forms=forms, validation=validation, submission=payload)
        )
    except PackageError as error:
        message = "invalid_structure"
        raise zones.issue(message) from error
    async with zones.transaction(sessions, user) as session:
        return await finalize(session, request, prepared)


async def prepare_submission(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    project: UUID,
    payload: PackageRequest,
    *,
    enabled: bool,
) -> tuple[PackageDetail, int]:
    managed = await import_package(sessions, user, project, payload, enabled=enabled)
    if managed is not None:
        publication, replayed = managed
        async with zones.transaction(sessions, user) as session:
            detail = await get_package(session, project, publication.package.package_id)
        return detail, 200 if replayed else 201
    try:
        legacy = payload.legacy()
    except ValidationError as error:
        raise RequestValidationError(error.errors()) from error
    async with zones.transaction(sessions, user) as session:
        detail = await prepare_package(session, project, user, legacy)
    return detail, 201
