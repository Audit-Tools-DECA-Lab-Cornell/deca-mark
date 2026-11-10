"""Validate and publish exactly the reviewed setup revision under one transaction."""

from uuid import UUID, uuid4

import orjson
from pydantic import TypeAdapter
from sqlalchemy import Result, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.database_errors import database_error
from fieldmaps_api.domain.map_setup_compilation import compile_package
from fieldmaps_api.domain.packages import PackageError, ProjectFile
from fieldmaps_api.domain.zone_archive_jobs import ImportJob
from fieldmaps_api.domain.zone_package_schemas import PackageIdentity
from fieldmaps_api.errors import DomainError, ErrorCode
from fieldmaps_api.map_setup_schemas import MapSetupPublish
from fieldmaps_api.queries import zones as q
from fieldmaps_api.repositories import map_setups as db
from fieldmaps_api.repositories import zones as zone_db
from fieldmaps_api.services import map_setups, zone_archives, zone_publication, zones
from fieldmaps_api.services.sites import get_package
from fieldmaps_api.zone_import_schemas import PackageRequest
from fieldmaps_api.zone_response_schemas import ImportValidation, PackageForms, Publication


def publish_fingerprint(payload: MapSetupPublish, supplied: str | None) -> str:
    """Bind replay to the request body and the manager's reviewed revision."""
    return map_setups.fingerprint(
        orjson.dumps(
            {"body": payload.model_dump(mode="json"), "etag": supplied},
            option=orjson.OPT_SORT_KEYS,
        )
    )


async def validate(
    session: AsyncSession,
    reference: zones.DraftReference,
    request: UUID,
) -> tuple[PackageRequest, ImportValidation]:
    stored = await db.get(session, reference.project, reference.site, reference.identifier)
    map_setups.check(stored.setup, reference.etag)
    attachment = stored.document.get("project_file")
    package = compile_package(
        reference.site,
        request,
        stored.setup.expected_current_package_id,
        stored.setup.content,
        list(stored.setup.layers),
        list(stored.setup.issues),
        ProjectFile.model_validate(attachment) if attachment else None,
    )
    result = ImportValidation.model_validate_json(
        await zone_db.invoke(
            session,
            q.IMPORT_VALIDATE,
            {
                "project": reference.project,
                "site": reference.site,
                "expected": package.expected_current_package_id,
                "body": zone_publication.request_body(package),
            },
        )
    )
    return package, result


async def publish(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    reference: zones.DraftReference,
    payload: MapSetupPublish,
) -> Publication:
    fingerprint = publish_fingerprint(payload, reference.etag)
    async with zones.transaction(sessions, user) as session:
        stored = await db.get(session, reference.project, reference.site, reference.identifier)
        result: Result[tuple[str, UUID]] = await session.execute(
            text("""SELECT fingerprint,(result->>'package_id')::uuid
            FROM fieldmaps_private.map_setup_operations WHERE setup_id=:setup
            AND actor=:user AND request_id=:request AND operation='publish'"""),
            {"setup": reference.identifier, "user": user, "request": payload.request_id},
        )
        receipt = result.tuples().one_or_none()
        if receipt is not None:
            if fingerprint != receipt[0]:
                code = "idempotency_conflict"
                raise DomainError(
                    code, "This request was already used for a different review.", 409
                )
            published = await get_package(session, reference.project, receipt[1])
            scope = await zone_db.scope(session, reference.project, reference.site)
            return Publication(
                site_id=reference.site,
                draft_id=None,
                package=published,
                current_package_id=scope.current_package_id,
                replayed=True,
            )
        package, validation = await validate(session, reference, payload.request_id)
        if package.expected_current_package_id != payload.expected_current_package_id:
            code = "publication_conflict"
            raise DomainError(code, "A newer map was published. Your setup is still saved.", 409)
        zone_publication.require_ready(validation)
        body = zone_publication.request_body(package)
        forms = PackageForms.model_validate_json(
            await zone_db.invoke(
                session,
                q.IMPORT_FORMS,
                {
                    "project": reference.project,
                    "site": reference.site,
                    "expected": payload.expected_current_package_id,
                    "body": body,
                },
            )
        )
        scope = await zone_db.scope(session, reference.project, reference.site)
        identity = PackageIdentity(reference.site, uuid4(), scope.next_version, scope.code)
    try:
        prepared = await zone_archives.prepare(
            ImportJob(identity=identity, forms=forms, validation=validation, submission=package)
        )
    except PackageError as error:
        raise zone_publication.refusal(error) from error
    async with zones.transaction(sessions, user) as session:
        try:
            async with session.begin_nested():
                finalized: Result[tuple[UUID, bool]] = await session.execute(
                    text("""SELECT (r.package).id,r.replayed
                    FROM fieldmaps_private.finalize_map_setup(
                    :project,:site,:setup,:revision,:fingerprint,:request,:expected,:package,:version,
                    CAST(:manifest AS jsonb),CAST(:layer AS jsonb),CAST(:archive AS bytea),
                    CAST(:checks AS jsonb),CAST(:body AS jsonb),CAST(:layer_bytes AS bytea)) r"""),
                    {
                        "project": reference.project,
                        "site": reference.site,
                        "setup": reference.identifier,
                        "revision": stored.setup.revision,
                        "fingerprint": fingerprint,
                        "request": payload.request_id,
                        "expected": payload.expected_current_package_id,
                        "package": prepared.manifest.package_id,
                        "version": prepared.manifest.package_version,
                        "manifest": prepared.manifest.model_dump_json(),
                        "layer": prepared.zone_layer.model_dump_json(),
                        "archive": prepared.archive,
                        "checks": orjson.dumps(
                            [c.model_dump(mode="json") for c in prepared.checks]
                        ).decode(),
                        "body": body,
                        "layer_bytes": prepared.zone_layer_bytes,
                    },
                )
                published_id, replayed = finalized.tuples().one()
        except DBAPIError as error:
            mapped = database_error(error)
            raise DomainError(
                TypeAdapter[ErrorCode](ErrorCode).validate_python(mapped.code),
                mapped.message,
                mapped.status,
                mapped.details,
            ) from error
        published = await get_package(session, reference.project, published_id)
        scope = await zone_db.scope(session, reference.project, reference.site)
        return Publication(
            site_id=reference.site,
            draft_id=None,
            package=published,
            current_package_id=scope.current_package_id,
            replayed=replayed,
        )
