"""Cancel expensive export work as soon as the authenticated HTTP peer disconnects."""

from uuid import UUID

import anyio
from fastapi import Request
from pydantic import TypeAdapter
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.errors import DomainError
from fieldmaps_api.observation_analysis_schemas import ObservationExportQuery
from fieldmaps_api.services.observation_exports import export


async def download(
    request: Request,
    sessions: async_sessionmaker[AsyncSession],
    user_id: UUID,
    project_id: UUID,
    filters: ObservationExportQuery,
) -> bytes:
    data: bytes | None = None
    failure: DomainError | SQLAlchemyError | None = None
    async with anyio.create_task_group() as group:

        async def disconnected() -> None:
            while True:
                kind = TypeAdapter(str).validate_python((await request.receive())["type"])
                if kind == "http.disconnect":
                    group.cancel_scope.cancel()
                    return

        group.start_soon(disconnected)
        try:
            data = await export(sessions, user_id, project_id, filters)
        except (DomainError, SQLAlchemyError) as error:
            failure = error
        finally:
            group.cancel_scope.cancel()
    if failure is not None:
        raise failure
    if data is None:
        code = "bad_request"
        message = "Export request disconnected"
        raise DomainError(code, message, 400)
    return data
