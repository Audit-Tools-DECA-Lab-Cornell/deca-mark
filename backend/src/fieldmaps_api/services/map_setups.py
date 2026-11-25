"""Manager-only draft operations with acknowledged revisions and retained source files."""

import hashlib
import re
from uuid import UUID

import orjson
from pydantic import JsonValue, TypeAdapter
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.domain.map_setup_compilation import validate_map
from fieldmaps_api.domain.map_setup_roles import keep_references
from fieldmaps_api.domain.packages import ProjectFile
from fieldmaps_api.errors import DomainError
from fieldmaps_api.map_setup_schemas import (
    MapSetup,
    MapSetupCandidate,
    MapSetupImport,
    MapSetupReplace,
    MapSetupSources,
)
from fieldmaps_api.repositories import map_setups as db
from fieldmaps_api.repositories import zones as zone_db
from fieldmaps_api.services import map_setup_imports, zones
from fieldmaps_api.services.map_setup_initial import initial_content


def etag(setup: MapSetup) -> str:
    return f'"map-setup:{setup.setup_id}:{setup.revision}"'


def check(current: MapSetup, supplied: str | None) -> None:
    if supplied is None or re.fullmatch(r'"map-setup:[0-9a-f-]{36}:[1-9][0-9]*"', supplied) is None:
        message = "precondition_required"
        raise DomainError(message, "Reload the saved map setup before changing it.", 428)
    if supplied != etag(current):
        message = "revision_conflict"
        raise DomainError(
            message, "Someone changed this map setup. Your changes are still here.", 412
        )
    if current.state != "draft":
        message = "conflict"
        raise DomainError(message, "This map setup is no longer editable.", 409)


def fingerprint(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


async def create(
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    project: UUID,
    site: UUID,
    payload: MapSetupImport,
) -> tuple[MapSetup, bool]:
    async with zones.transaction(sessions, user) as session:
        scope = await zone_db.scope(session, project, site)
        previous = await db.replay(
            session,
            project,
            site,
            payload.request_id,
            "import",
            fingerprint(payload.model_dump_json().encode()),
        )
        if previous is not None:
            return previous, True
        if scope.current_package_id != payload.expected_current_package_id:
            code = "publication_conflict"
            raise DomainError(
                code, "A newer map was published. Reload the site before starting setup.", 409
            )
        initial = await initial_content(session, project, site, payload.expected_current_package_id)
    imported = await map_setup_imports.convert(list(payload.files), payload.mode)
    if payload.mode == "project":
        initial = initial.model_copy(update={"assignments": keep_references(imported.layers)})
    document = {
        **imported.model_dump(mode="json"),
        "content": initial.model_dump(mode="json"),
        "base_zone_ids": [str(zone.zone_id) for zone in initial.zones],
        "sources": [{"file_name": f.file_name, "size": len(f.content)} for f in payload.files],
    }
    async with zones.transaction(sessions, user) as session:
        created = await zone_db.invoke(
            session,
            text(
                """SELECT jsonb_build_array(result.setup_id,result.replayed)::text
                FROM fieldmaps_private.create_map_setup(:project,
                :site,
                :request,
                :expected,
                CAST(:document AS jsonb),
                CAST(:sources AS jsonb),
                :fingerprint) result"""
            ),
            {
                "project": project,
                "site": site,
                "request": payload.request_id,
                "expected": payload.expected_current_package_id,
                "document": orjson.dumps(document).decode(),
                "sources": TypeAdapter(tuple[ProjectFile, ...]).dump_json(payload.files).decode(),
                "fingerprint": fingerprint(payload.model_dump_json().encode()),
            },
        )
        identifier, replayed = TypeAdapter(tuple[UUID, bool]).validate_json(created)
        return (await db.get(session, project, site, identifier)).setup, replayed


async def replace(  # noqa: PLR0913, PLR0917 - explicit authenticated request boundary
    session: AsyncSession,
    project: UUID,
    site: UUID,
    identifier: UUID,
    supplied: str | None,
    payload: MapSetupReplace,
) -> MapSetup:
    stored = await db.get(session, project, site, identifier)
    check(stored.setup, supplied)
    if payload.import_generation != stored.setup.import_generation:
        message = "revision_conflict"
        raise DomainError(message, "The imported map changed. Review it again.", 412)
    map_fields = {"outline", "zones", "assignments", "confirmed_omissions"}
    ready = stored.setup.ready_for_form and (
        payload.model_dump(include=map_fields)
        == stored.setup.content.model_dump(include=map_fields)
    )
    document: dict[str, JsonValue] = {
        **stored.document,
        "content": payload.model_dump(mode="json"),
        "ready_for_form": ready,
    }
    return await save_document(
        session, zones.DraftReference(project, site, identifier, supplied), stored.setup, document
    )


async def complete_map(session: AsyncSession, reference: zones.DraftReference) -> MapSetup:
    stored = await db.get(session, reference.project, reference.site, reference.identifier)
    check(stored.setup, reference.etag)
    scope = await zone_db.scope(session, reference.project, reference.site)
    if scope.current_package_id != stored.setup.expected_current_package_id:
        code = "publication_conflict"
        raise DomainError(code, "A newer map was published. Your setup is still saved.", 409)
    if stored.setup.ready_for_form:
        return stored.setup
    validate_map(stored.setup.content, stored.setup.layers, stored.setup.issues)
    return await save_document(
        session, reference, stored.setup, {**stored.document, "ready_for_form": True}
    )


async def save_document(
    session: AsyncSession,
    reference: zones.DraftReference,
    setup: MapSetup,
    document: dict[str, JsonValue],
) -> MapSetup:
    await zone_db.invoke(
        session,
        text(
            """SELECT fieldmaps_private.replace_map_setup(:project,
            :site,
            :setup,
            :revision,
            CAST(:document AS jsonb),
            NULL,
            NULL,
            NULL)"""
        ),
        {
            "project": reference.project,
            "site": reference.site,
            "setup": reference.identifier,
            "revision": setup.revision,
            "document": orjson.dumps(document).decode(),
        },
    )
    return (await db.get(session, reference.project, reference.site, reference.identifier)).setup


async def update_sources(  # noqa: PLR0913, PLR0917 - explicit authenticated request boundary
    sessions: async_sessionmaker[AsyncSession],
    user: UUID,
    project: UUID,
    site: UUID,
    identifier: UUID,
    supplied: str | None,
    payload: MapSetupSources,
) -> MapSetupCandidate | MapSetup:
    request_fingerprint = fingerprint(
        payload.model_dump_json(
            exclude={"replace_project"} if not payload.replace_project else None
        ).encode()
    )
    async with zones.transaction(sessions, user) as session:
        if not payload.preview:
            previous = await db.replay(
                session,
                project,
                site,
                payload.request_id,
                "sources",
                request_fingerprint,
            )
            if previous is not None:
                if previous.setup_id != identifier:
                    code = "idempotency_conflict"
                    raise DomainError(code, "This request belongs to another map setup.", 409)
                return previous
        stored = await db.get(session, project, site, identifier)
        check(stored.setup, supplied)
        retained = TypeAdapter(list[ProjectFile]).validate_json(
            await db.sources(session, project, site, identifier)
        )
    retained = map_setup_imports.normalized_sources(retained)
    additions = map_setup_imports.normalized_sources(list(payload.files))
    files = {f.file_name: f for f in retained}
    files.update({f.file_name: f for f in additions})
    merged = additions if payload.replace_project else list(files.values())
    mode = (
        "project" if payload.replace_project or stored.document.get("project_file") else "geojson"
    )
    imported = await map_setup_imports.convert(merged, mode)
    generation = stored.setup.import_generation + 1
    source_metadata = [{"file_name": f.file_name, "size": len(f.content)} for f in merged]
    candidate = fingerprint(
        orjson.dumps(
            {
                "revision": stored.setup.revision,
                "import": imported.model_dump(mode="json"),
                "sources": [f.model_dump(mode="json") for f in merged],
            },
            option=orjson.OPT_SORT_KEYS,
        )
    )
    if payload.preview:
        async with zones.transaction(sessions, user) as session:
            authorized = (await db.get(session, project, site, identifier)).setup
            check(authorized, supplied)
        return MapSetupCandidate.model_validate(
            {
                "candidate_hash": candidate,
                "import_generation": generation,
                "layers": imported.layers,
                "issues": imported.issues,
                "sources": source_metadata,
            }
        )
    if payload.candidate_hash != candidate:
        message = "revision_conflict"
        raise DomainError(message, "Source files changed. Review the new preview.", 412)
    keys = {(layer.source_id, f.feature_key) for layer in imported.layers for f in layer.features}
    saved = stored.setup.content.assignments
    content = stored.setup.content.model_copy(
        update={
            "import_generation": generation,
            "assignments": (
                keep_references(imported.layers, saved)
                if mode == "project"
                else tuple(a for a in saved if (a.source_id, a.feature_key) in keys)
            ),
            "confirmed_omissions": (),
        }
    )
    document = {
        **imported.model_dump(mode="json"),
        "content": content.model_dump(mode="json"),
        "base_zone_ids": stored.document.get("base_zone_ids", []),
        "sources": source_metadata,
    }
    async with zones.transaction(sessions, user) as session:
        await zone_db.invoke(
            session,
            text(
                """SELECT fieldmaps_private.replace_map_setup(:project,
                :site,
                :setup,
                :revision,
                CAST(:document AS jsonb),
                CAST(:sources AS jsonb),
                :request,
                :fingerprint)"""
            ),
            {
                "project": project,
                "site": site,
                "setup": identifier,
                "revision": stored.setup.revision,
                "document": orjson.dumps(document).decode(),
                "sources": TypeAdapter(list[ProjectFile]).dump_json(merged).decode(),
                "request": payload.request_id,
                "fingerprint": request_fingerprint,
            },
        )
        return (await db.get(session, project, site, identifier)).setup
