"""Context authorization precedes every library read."""

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.errors import NotFoundError, RoleRequiredError
from fieldmaps_api.library_schemas import Library, Variable, VariableUsage
from fieldmaps_api.queries import tenancy as tq
from fieldmaps_api.repositories import library as db
from fieldmaps_api.repositories import tenancy
from fieldmaps_api.services.tenancy import project as read_project
from fieldmaps_api.tenancy_schemas import Organization


async def context(
    session: AsyncSession, scope_id: UUID, *, project: bool
) -> tuple[UUID, UUID | None, bool]:
    await session.execute(text("SELECT fieldmaps_private.assert_active_user()"))
    if project:
        p = await read_project(session, scope_id)
        if p.role not in {"manager", "viewer"}:
            message = "Viewer or manager access required"
            raise RoleRequiredError(message)
        return p.organization_id, p.project_id, p.role == "manager"
    await tenancy.one(session, tq.ORG, Organization, {"id": scope_id})
    await tenancy.require_manager(session, tq.ORG_MANAGER, scope_id)
    return scope_id, None, True


async def read(session: AsyncSession, scope_id: UUID, *, project: bool) -> Library:
    org, project_id, _ = await context(session, scope_id, project=project)
    return await db.read(session, org, project_id)


async def detail(
    session: AsyncSession, scope_id: UUID, item_id: UUID, *, project: bool
) -> Variable:
    org, project_id, _ = await context(session, scope_id, project=project)
    item = await db.variable(session, org, project_id, item_id)
    if item is None:
        message = "Variable not found"
        raise NotFoundError(message)
    return item


async def usage(
    session: AsyncSession, scope_id: UUID, item_id: UUID, *, project: bool
) -> VariableUsage:
    org, project_id, manager = await context(session, scope_id, project=project)
    item = await db.variable(session, org, project_id, item_id)
    if item is None:
        message = "Variable not found"
        raise NotFoundError(message)
    can_edit = False
    if item.level == "organization":
        result = await session.execute(tq.ORG_MANAGER, {"id": org})
        can_edit = result.scalar_one() is True
    elif item.level in {"project", "site"}:
        can_edit = manager
    return await db.usage(session, org, project_id, item, can_edit=can_edit)
