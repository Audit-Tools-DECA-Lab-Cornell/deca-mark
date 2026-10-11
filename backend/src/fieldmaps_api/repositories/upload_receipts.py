from dataclasses import dataclass
from typing import TYPE_CHECKING, ClassVar, Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.errors import ConflictError
from fieldmaps_api.queries import collection as queries
from fieldmaps_api.schemas import UploadReceipt
from fieldmaps_api.zone_observation_schemas import BoundUploadReceipt

if TYPE_CHECKING:
    from sqlalchemy import Result


@dataclass(frozen=True, slots=True)
class ReceiptIdentity:
    observation_id: UUID
    project_id: UUID
    user_id: UUID
    fingerprint: str
    protocol: Literal[1, 2]
    hash_version: Literal["zone-upload-v2-jcs-1"] | None


class StoredReceipt(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True)
    observation_id: UUID
    project_id: UUID
    user_id: UUID | None
    accepted_revision: Literal[1]
    received_at: AwareDatetime
    upload_hash: str | None
    upload_protocol: Literal[1, 2]
    upload_hash_version: Literal["zone-upload-v2-jcs-1"] | None
    package_id: UUID | None
    zone_id: UUID | None

    def legacy(self) -> UploadReceipt:
        if self.user_id is None or self.upload_hash is None:
            message = "This observation ID already exists with a different upload"
            raise ConflictError(message)
        return UploadReceipt(
            observation_id=self.observation_id,
            project_id=self.project_id,
            user_id=self.user_id,
            accepted_revision=1,
            received_at=self.received_at,
        )

    def bound(self) -> BoundUploadReceipt:
        if (
            self.user_id is None
            or self.upload_hash is None
            or self.package_id is None
            or self.zone_id is None
        ):
            message = "This observation ID already exists with a different upload"
            raise ConflictError(message)
        return BoundUploadReceipt(
            observation_id=self.observation_id,
            project_id=self.project_id,
            user_id=self.user_id,
            accepted_revision=1,
            received_at=self.received_at,
            schema_version=2,
            package_id=self.package_id,
            zone_id=self.zone_id,
            assignment_basis="recorded_package",
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
        stored.upload_protocol,
        stored.upload_hash_version,
    ) != (
        identity.project_id,
        identity.user_id,
        identity.fingerprint,
        identity.protocol,
        identity.hash_version,
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
