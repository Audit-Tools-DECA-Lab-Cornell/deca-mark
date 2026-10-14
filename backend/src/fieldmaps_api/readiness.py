from json import JSONDecodeError
from typing import TYPE_CHECKING, ClassVar, Final, Literal

import anyio
from jwt import PyJWKClient, PyJWTError
from pydantic import BaseModel, ConfigDict
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine

from fieldmaps_api.errors import StorageUnavailableError

if TYPE_CHECKING:
    from sqlalchemy import Result

SCHEMA_READY: Final = text("""
SELECT to_regprocedure('fieldmaps_private.zone_package_metadata(uuid)') IS NOT NULL
   AND to_regprocedure('fieldmaps_private.zone_authoring_available(uuid,uuid)') IS NOT NULL
""")


class DatabaseRole(BaseModel):
    rolbypassrls: bool
    rolsuper: bool


class ReadyResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    status: Literal["ready"] = "ready"


async def assert_safe_role(engine: AsyncEngine) -> None:
    async with engine.connect() as connection:
        result = await connection.execute(
            text("SELECT rolbypassrls, rolsuper FROM pg_roles WHERE rolname = current_user")
        )
        role = DatabaseRole.model_validate(result.mappings().one())
    require_restricted_role(role)


def require_restricted_role(role: DatabaseRole) -> None:
    if role.rolbypassrls or role.rolsuper:
        message = "API database role must not be superuser or bypass row security"
        raise RuntimeError(message)


async def check_ready(engine: AsyncEngine, jwks: PyJWKClient | None) -> ReadyResponse:
    try:
        async with engine.connect() as connection:
            result: Result[tuple[bool]] = await connection.execute(SCHEMA_READY)
            if not result.scalar_one():
                message = "Database schema does not match this API"
                raise StorageUnavailableError(message)
    except (SQLAlchemyError, OSError) as error:
        raise StorageUnavailableError from error
    if jwks is None:
        message = "Sign-in provider has not been configured"
        raise StorageUnavailableError(message)
    try:
        await anyio.to_thread.run_sync(jwks.get_jwk_set)
    except (PyJWTError, JSONDecodeError) as error:
        message = "Sign-in verification is temporarily unavailable"
        raise StorageUnavailableError(message) from error
    return ReadyResponse()
