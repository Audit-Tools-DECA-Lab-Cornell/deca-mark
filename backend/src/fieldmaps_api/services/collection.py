from hashlib import sha256
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.errors import (
    NotFoundError,
    RoleRequiredError,
)
from fieldmaps_api.repositories import collection, upload_receipts
from fieldmaps_api.repositories.upload_receipts import ReceiptIdentity
from fieldmaps_api.schemas import (
    ObservationQuery,
    ObservationRow,
    ObservationUpload,
    StoredObservation,
    UploadReceipt,
)
from fieldmaps_api.services.observation_answers import validated_answers
from fieldmaps_api.services.tenancy import project


async def upload_observation(
    session: AsyncSession,
    project_id: UUID,
    observation_id: UUID,
    user_id: UUID,
    payload: ObservationUpload,
) -> UploadReceipt:
    await upload_receipts.authorize(session, project_id)
    identity = ReceiptIdentity(
        observation_id,
        project_id,
        user_id,
        sha256(payload.model_dump_json(exclude_unset=True).encode()).hexdigest(),
        1,
        None,
    )
    replay = await upload_receipts.replay(session, identity)
    if replay is not None:
        return replay.legacy()
    target = await collection.upload_target(session, project_id, payload)
    if target is None:
        message = "You cannot upload to this project, site, or form"
        raise RoleRequiredError(message)
    upload = collection.ObservationWrite(
        observation_id=observation_id,
        project_id=project_id,
        user_id=user_id,
        target=target,
        payload=payload,
        answers_json=validated_answers(target.definition, payload.answers),
        # Only what was sent: an upload made before the round fields existed hashes as it did.
        fingerprint=identity.fingerprint,
    )
    await collection.insert_observation(session, upload)
    receipt = await upload_receipts.committed(session, identity)
    return receipt.legacy()


async def list_observations(
    session: AsyncSession,
    project_id: UUID,
    filters: ObservationQuery,
) -> list[ObservationRow]:
    await project(session, project_id)
    return await collection.list_observations(session, project_id, filters)


async def get_observation(
    session: AsyncSession, project_id: UUID, observation_id: UUID
) -> StoredObservation:
    observation = await collection.get_observation(session, project_id, observation_id)
    if observation is None:
        message = "Observation not found"
        raise NotFoundError(message)
    return observation
