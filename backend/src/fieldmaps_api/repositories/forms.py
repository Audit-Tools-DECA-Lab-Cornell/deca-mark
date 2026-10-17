import json
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

from pydantic import BaseModel, JsonValue, TypeAdapter
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.form_schemas import FormSummary, FormVersionDetail
from fieldmaps_api.queries import forms as queries

if TYPE_CHECKING:
    from sqlalchemy import Result

DEFINITION: TypeAdapter[dict[str, JsonValue]] = TypeAdapter(dict[str, JsonValue])


class FormRef(BaseModel):
    id: UUID
    code: str
    organization_id: UUID


async def list_forms(session: AsyncSession, project_id: UUID) -> list[FormSummary]:
    result: Result[tuple[str]] = await session.execute(queries.FORMS, {"project": project_id})
    return [FormSummary.model_validate_json(row) for row in result.scalars()]


async def get_version(
    session: AsyncSession, project_id: UUID, code: str
) -> FormVersionDetail | None:
    result: Result[tuple[str]] = await session.execute(
        queries.VERSION, {"project": project_id, "code": code}
    )
    data = result.scalar_one_or_none()
    return None if data is None else FormVersionDetail.model_validate_json(data)


async def get_form(session: AsyncSession, project_id: UUID, code: str) -> FormRef | None:
    result: Result[tuple[str]] = await session.execute(
        queries.FORM, {"project": project_id, "code": code}
    )
    data = result.scalar_one_or_none()
    return None if data is None else FormRef.model_validate_json(data)


async def latest_definition(session: AsyncSession, form_id: UUID) -> dict[str, JsonValue] | None:
    result: Result[tuple[str]] = await session.execute(queries.LATEST_DEFINITION, {"form": form_id})
    data = result.scalar_one_or_none()
    return None if data is None else DEFINITION.validate_json(data)


async def next_version(session: AsyncSession, form_id: UUID) -> int:
    result: Result[tuple[int]] = await session.execute(queries.NEXT_VERSION, {"form": form_id})
    return result.scalar_one()


async def insert_form(
    session: AsyncSession, project_id: UUID, organization_id: UUID, code: str, name: str
) -> UUID:
    form_id = uuid4()
    await session.execute(
        queries.CREATE_FORM,
        {
            "id": form_id,
            "organization": organization_id,
            "project": project_id,
            "code": code,
            "name": name,
        },
    )
    return form_id


async def insert_draft(  # noqa: PLR0913 - one row's columns, named at the call site
    session: AsyncSession,
    *,
    project_id: UUID,
    organization_id: UUID,
    form_id: UUID,
    version: int,
    code: str,
    definition: dict[str, JsonValue],
) -> None:
    await session.execute(
        queries.CREATE_DRAFT,
        {
            "id": uuid4(),
            "organization": organization_id,
            "project": project_id,
            "form": form_id,
            "version": version,
            "code": code,
            "definition": json.dumps(definition, sort_keys=True),
        },
    )


async def update_draft(  # noqa: PLR0913, PLR0917 - definition and its atomic precondition
    session: AsyncSession,
    project_id: UUID,
    code: str,
    definition: dict[str, JsonValue],
    version_id: UUID,
    revision: int,
) -> bool:
    result: Result[tuple[UUID]] = await session.execute(
        queries.UPDATE_DRAFT,
        {
            "project": project_id,
            "code": code,
            "definition": json.dumps(definition, sort_keys=True),
            "version_id": version_id,
            "revision": revision,
        },
    )
    return result.scalar_one_or_none() is not None


async def discard_draft(
    session: AsyncSession, project_id: UUID, code: str, version_id: UUID, revision: int
) -> bool:
    result: Result[tuple[UUID]] = await session.execute(
        queries.DISCARD_DRAFT,
        {"project": project_id, "code": code, "version_id": version_id, "revision": revision},
    )
    return result.scalar_one_or_none() is not None


async def publish(session: AsyncSession, project_id: UUID, version_id: UUID, revision: int) -> None:
    await session.execute(
        queries.PUBLISH, {"project": project_id, "id": version_id, "revision": revision}
    )


async def retire(session: AsyncSession, project_id: UUID, version_id: UUID) -> None:
    await session.execute(queries.RETIRE, {"project": project_id, "id": version_id})
