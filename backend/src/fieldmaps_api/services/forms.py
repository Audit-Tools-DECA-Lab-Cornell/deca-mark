"""The instrument lifecycle: forms, drafts a manager edits, publishing and retiring (BE-11).

A definition must pass current authoring eligibility before publication. Historical reads retain
structural validation and uploads enforce the original answer constraints. The definition names
its own version code and state, which is what the collector keys records and uploadability by.
"""

from uuid import UUID

from pydantic import JsonValue, ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.errors import ConflictError, NotFoundError, ValidationFailedError
from fieldmaps_api.form_preconditions import require_form_etag, revision_conflict
from fieldmaps_api.form_schemas import (
    DraftCreate,
    DraftUpdate,
    FormCreate,
    FormSummary,
    FormVersionDetail,
)
from fieldmaps_api.queries import tenancy as tenancy_queries
from fieldmaps_api.repositories import forms
from fieldmaps_api.repositories import sites as site_db
from fieldmaps_api.repositories import tenancy as tenancy_db
from fieldmaps_api.services.tenancy import project


def version_code(form_code: str, version: int) -> str:
    return f"{form_code}-v{version}"


def checked_definition(
    definition: dict[str, JsonValue], code: str, state: str
) -> dict[str, JsonValue]:
    """Stamp the definition with its version code and state, or name what is wrong (422)."""
    stamped: dict[str, JsonValue] = {**definition, "version": code, "status": state}
    try:
        FormDefinition.model_validate(stamped)
    except ValidationError as error:
        problems = "; ".join(
            f"{'.'.join(str(part) for part in issue['loc']) or 'definition'}: {issue['msg']}"
            for issue in error.errors()[:8]
        )
        message = f"This form cannot be used yet. {problems}"
        raise ValidationFailedError(message, field="definition") from error
    return stamped


async def list_forms(session: AsyncSession, project_id: UUID) -> list[FormSummary]:
    await project(session, project_id)
    return await forms.list_forms(session, project_id)


async def get_version(session: AsyncSession, project_id: UUID, code: str) -> FormVersionDetail:
    version = await forms.get_version(session, project_id, code)
    if version is None:
        message = "Form version not found"
        raise NotFoundError(message)
    return version


async def create_form(
    session: AsyncSession, project_id: UUID, payload: FormCreate
) -> FormVersionDetail:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    organization_id = await site_db.project_organization(session, project_id)
    if organization_id is None:
        message = "Project not found"
        raise NotFoundError(message)
    code = version_code(payload.code, 1)
    definition = checked_definition(payload.definition, code, "draft")
    try:
        async with session.begin_nested():
            form_id = await forms.insert_form(
                session, project_id, organization_id, payload.code, payload.name
            )
            await forms.insert_draft(
                session,
                project_id=project_id,
                organization_id=organization_id,
                form_id=form_id,
                version=1,
                code=code,
                definition=definition,
            )
    except IntegrityError as error:
        message = f'This project already has a form with the code "{payload.code}"'
        raise ConflictError(message) from error
    return await get_version(session, project_id, code)


async def create_draft(
    session: AsyncSession, project_id: UUID, form_code: str, payload: DraftCreate
) -> FormVersionDetail:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    form = await forms.get_form(session, project_id, form_code)
    if form is None:
        message = "Form not found"
        raise NotFoundError(message)
    source = (
        payload.definition
        if payload.definition is not None
        else await forms.latest_definition(session, form.id)
    )
    if source is None:
        message = "This form has no version to copy; send a definition"
        raise ValidationFailedError(message, field="definition")
    number = await forms.next_version(session, form.id)
    code = version_code(form.code, number)
    definition = checked_definition(source, code, "draft")
    try:
        async with session.begin_nested():
            await forms.insert_draft(
                session,
                project_id=project_id,
                organization_id=form.organization_id,
                form_id=form.id,
                version=number,
                code=code,
                definition=definition,
            )
    except IntegrityError as error:
        message = "Another draft of this form was started at the same moment; try again"
        raise ConflictError(message) from error
    return await get_version(session, project_id, code)


async def update_draft(
    session: AsyncSession, project_id: UUID, code: str, payload: DraftUpdate, etag: str | None
) -> FormVersionDetail:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    expected_id, revision = require_form_etag(etag)
    current = await get_version(session, project_id, code)
    if current.state != "draft":
        message = f"{code} is {current.state}; start a new draft to change it"
        raise ConflictError(message)
    if current.version_id != expected_id or current.revision != revision:
        raise revision_conflict()
    definition = checked_definition(payload.definition, code, "draft")
    if not await forms.update_draft(session, project_id, code, definition, expected_id, revision):
        # Another manager can publish or discard after the initial read. Distinguish a
        # surviving, frozen version from a missing one; neither is a successful save.
        latest = await get_version(session, project_id, code)
        if latest.state == "draft":
            raise revision_conflict()
        message = f"{code} changed while you were saving; reload it before trying again"
        raise ConflictError(message)
    return await get_version(session, project_id, code)


async def discard_draft(
    session: AsyncSession, project_id: UUID, code: str, etag: str | None
) -> None:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    expected_id, revision = require_form_etag(etag)
    current = await get_version(session, project_id, code)
    if current.state != "draft":
        message = f"{code} is {current.state}; only a draft can be discarded"
        raise ConflictError(message)
    if current.version_id != expected_id or current.revision != revision:
        raise revision_conflict()
    if not await forms.discard_draft(session, project_id, code, expected_id, revision):
        latest = await get_version(session, project_id, code)
        if latest.state == "draft":
            raise revision_conflict()
        message = f"{code} changed while you were discarding it; reload it before trying again"
        raise ConflictError(message)


async def publish(
    session: AsyncSession, project_id: UUID, code: str, etag: str | None
) -> FormVersionDetail:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    expected_id, revision = require_form_etag(etag)
    current = await get_version(session, project_id, code)
    if current.version_id != expected_id or current.revision != revision:
        raise revision_conflict()
    # Checked again at publication: what devices download must parse exactly as uploads are checked.
    checked_definition(current.definition, code, "published")
    await forms.publish(session, project_id, current.version_id, revision)
    return await get_version(session, project_id, code)


async def retire(session: AsyncSession, project_id: UUID, code: str) -> FormVersionDetail:
    await tenancy_db.require_manager(session, tenancy_queries.PROJECT_MANAGER, project_id)
    current = await get_version(session, project_id, code)
    await forms.retire(session, project_id, current.version_id)
    return await get_version(session, project_id, code)
