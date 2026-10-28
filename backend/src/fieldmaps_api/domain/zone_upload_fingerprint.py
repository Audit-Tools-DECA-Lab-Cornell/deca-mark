from hashlib import sha256
from typing import Final
from uuid import UUID

import rfc8785

from fieldmaps_api.zone_observation_schemas import BoundObservationUpload

HASH_VERSION: Final = "observation-jcs-1"


def canonical_bytes(
    project_id: UUID, observation_id: UUID, user_id: UUID, payload: BoundObservationUpload
) -> bytes:
    document = payload.model_dump(mode="json", exclude={"started_at"})
    if payload.started_at is not None:
        document["started_at"] = payload.started_at.isoformat(timespec="microseconds").replace(
            "+00:00", "Z"
        )
    document["observed_at"] = payload.observed_at.isoformat(timespec="microseconds").replace(
        "+00:00", "Z"
    )
    return rfc8785.dumps(
        {
            "canonicalization_version": HASH_VERSION,
            "observation_id": str(observation_id),
            "project_id": str(project_id),
            "user_id": str(user_id),
            "payload": document,
        }
    )


def fingerprint(
    project_id: UUID, observation_id: UUID, user_id: UUID, payload: BoundObservationUpload
) -> str:
    return sha256(canonical_bytes(project_id, observation_id, user_id, payload)).hexdigest()
