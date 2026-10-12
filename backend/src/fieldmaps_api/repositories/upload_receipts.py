from dataclasses import dataclass
from typing import TYPE_CHECKING, ClassVar, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.errors import ConflictError
from fieldmaps_api.queries import collection as queries
from fieldmaps_api.zone_observation_schemas import BoundUploadReceipt

if TYPE_CHECKING:
    from sqlalchemy import Result


@dataclass(frozen=True, slots=True)
class ReceiptIdentity:
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    fingerprint: str


class StoredReceipt(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    observation_id: UUID
    project_id: UUID
    user_id: UUID | None
    accepted_revision: Literal[1]
    received_at: AwareDatetime
    upload_hash: str | None
    package_id: UUID
    zone_id: UUID

    def bound(self) -> BoundUploadReceipt:
        if self.user_id is None or self.upload_hash is None:
            message = "This observation ID already exists with a different upload"
            raise ConflictError(message)
        return BoundUploadReceipt(
            observation_id=self.observation_id,
            project_id=self.project_id,
            user_id=self.user_id,
            accepted_revision=1,
            received_at=self.received_at,
            package_id=self.package_id,
            zone_id=self.zone_id,
        )


async def authorize(session: AsyncSession, project: UUID) -> None:
    await session.execute(queries.AUTHORIZE_UPLOAD, {"project": project})


async def replay(session: AsyncSession, identity: ReceiptIdentity) -> StoredReceipt | None:
    result: Result[tuple[str]] = await session.execute(
        queries.STORED_RECEIPT, {"id": identity.observation_id}
    )
    data = result.scalar_one_or_none()
    if data is None:
        return None
    stored = StoredReceipt.model_validate_json(data)
    if (
        stored.project_id,
        stored.user_id,
        stored.upload_hash,
    ) != (
        identity.project_id,
        identity.user_id,
        identity.fingerprint,
    ):
        message = "This observation ID already exists with a different upload"
        raise ConflictError(message)
    return stored


async def committed(session: AsyncSession, identity: ReceiptIdentity) -> StoredReceipt:
    receipt = await replay(session, identity)
    if receipt is None:
        message = "This observation ID already exists with a different upload"
        raise ConflictError(message)
    return receipt
