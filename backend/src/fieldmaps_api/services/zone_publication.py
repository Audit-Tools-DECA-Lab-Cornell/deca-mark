from dataclasses import dataclass
from uuid import UUID, uuid4

import orjson
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.domain.packages import PackageError
from fieldmaps_api.domain.zone_archive_jobs import ImportJob, PublishJob
from fieldmaps_api.domain.zone_package_schemas import PackageIdentity, PreparedZonePackage
from fieldmaps_api.errors import DomainError, RoleRequiredError
from fieldmaps_api.queries import zones as q
from fieldmaps_api.repositories import zones as db
from fieldmaps_api.services import zone_archives, zones
from fieldmaps_api.services.sites import get_package, read_package_archive
from fieldmaps_api.zone_draft_schemas import DraftPublish
from fieldmaps_api.zone_import_schemas import PackageRequest
from fieldmaps_api.zone_response_schemas import ImportValidation, PackageForms, Publication


@dataclass(frozen=True, slots=True)
class PublicationRequest:
    project: UUID
    site: UUID
    request: UUID
    expected: UUID | None
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
    current = await db.scope(session, request.project, request.site, manager=False)
    return (
        Publication(
            site_id=request.site,
            draft_id=request.draft,
            package=package,
            current_package_id=current.current_package_id,
            replayed=replayed,
        ),
        replayed,
    )


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
) -> tuple[Publication, bool]:
    async with zones.transaction(sessions, user) as session:
        site = await db.identifier(
            session, q.SITE_BY_ID, {"project": project, "site": payload.site_id}
        )
        if site is None:
            msg = "Manager access to the site and form is required"
            raise RoleRequiredError(msg)
        scope = await db.scope(session, project, site)
        if not scope.manager:
            msg = "Manager access to the site is required"
            raise RoleRequiredError(msg)
        if "expected_current_package_id" not in payload.model_fields_set:
            message = "precondition_required"
            raise DomainError(message, "expected_current_package_id is required", 428)
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
) -> tuple[Publication, int]:
    publication, replayed = await import_package(sessions, user, project, payload)
    return publication, 200 if replayed else 201
