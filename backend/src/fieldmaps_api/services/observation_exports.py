"""Request-bounded SQL snapshot and process serialization with capacity and hard cancellation."""

import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from time import monotonic
from typing import Final
from uuid import UUID

import anyio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import user_transaction
from fieldmaps_api.domain.observation_export import (
    ROW_LIMIT,
    SOURCE_BYTE_LIMIT,
    TIME_LIMIT,
    too_large,
)
from fieldmaps_api.errors import DomainError, RoleRequiredError
from fieldmaps_api.observation_analysis_schemas import ObservationExportQuery
from fieldmaps_api.repositories import observation_analysis as db
from fieldmaps_api.services.tenancy import project

EXPORT_LIMITER: Final = anyio.CapacityLimiter(2)
SOURCE_ROOT: Final = str(Path(__file__).resolve().parents[2])


async def export(
    sessions: async_sessionmaker[AsyncSession],
    user_id: UUID,
    project_id: UUID,
    filters: ObservationExportQuery,
) -> bytes:
    started = monotonic()
    try:
        with anyio.fail_after(TIME_LIMIT):
            try:
                EXPORT_LIMITER.acquire_nowait()
            except anyio.WouldBlock:
                code = "rate_limited"
                raise DomainError(
                    code,
                    "Exports are busy; retry shortly",
                    429,
                    headers={"Retry-After": "2"},
                ) from None
            try:
                async with user_transaction(sessions, user_id) as session:
                    access = await project(session, project_id)
                    if access.is_training or access.role not in {"manager", "viewer"}:
                        message = "Research viewer or manager access required for exports"
                        raise RoleRequiredError(message)
                    await db.validate_scope(session, project_id, filters)
                    snapshot = await db.export(
                        session,
                        project_id,
                        filters,
                        row_limit=ROW_LIMIT,
                        byte_limit=SOURCE_BYTE_LIMIT,
                    )
                if snapshot.total_matching > ROW_LIMIT or snapshot.source_bytes > SOURCE_BYTE_LIMIT:
                    raise too_large()
                with TemporaryDirectory(prefix="decamark-export-") as temporary:
                    directory = Path(temporary)
                    (directory / "snapshot.json").write_text(
                        snapshot.model_dump_json(by_alias=True, exclude_unset=True)
                    )
                    (directory / "filters.json").write_text(filters.model_dump_json())
                    (directory / "project.txt").write_text(str(project_id))
                    result = await anyio.run_process(
                        [
                            sys.executable,
                            "-m",
                            "fieldmaps_api.domain.observation_export_worker",
                            str(directory),
                        ],
                        env={"PYTHONPATH": SOURCE_ROOT},
                        check=False,
                    )
                    if result.returncode != 0:
                        raise too_large()
                    data = (directory / "export.zip").read_bytes()
                if monotonic() - started >= TIME_LIMIT:
                    raise too_large()
                return data
            finally:
                EXPORT_LIMITER.release()
    except TimeoutError:
        raise too_large() from None
