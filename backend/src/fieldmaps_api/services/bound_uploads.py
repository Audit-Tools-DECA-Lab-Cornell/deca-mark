from typing import Never, assert_never
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.domain.form_engine import Answers
from fieldmaps_api.domain.zone_upload_fingerprint import fingerprint
from fieldmaps_api.errors import DomainError, NotFoundError
from fieldmaps_api.repositories import bound_uploads, upload_receipts
from fieldmaps_api.repositories.upload_receipts import ReceiptIdentity
from fieldmaps_api.schemas import UploadTarget
from fieldmaps_api.services.observation_answers import validated_answers
from fieldmaps_api.zone_error_details import SafeZoneIssue, ZoneIssueCode
from fieldmaps_api.zone_observation_schemas import BoundObservationUpload, BoundUploadReceipt


def reject_binding(code: ZoneIssueCode, zone: UUID) -> Never:
    issue = SafeZoneIssue(code=code, zone_ids=[zone])
    message = "Observation binding is invalid"
    failure = DomainError(
        "validation_failed",
        message,
        422,
        {
            "issues": [issue.safe_value()],
        },
    )
    raise failure


def validated_target(
    target: bound_uploads.BoundTarget | None, payload: BoundObservationUpload
) -> UploadTarget:
    if target is None:
        message = "Package not found"
        raise NotFoundError(message)
    if target.site_id != payload.site_id:
        reject_binding("package_not_in_site", payload.zone_id)
    if not target.ready:
        reject_binding("package_not_ready", payload.zone_id)
    if not target.zone_present:
        reject_binding("zone_not_in_package", payload.zone_id)
    if (
        target.form_version != payload.form_version
        or target.form_version_id is None
        or target.definition is None
    ):
        reject_binding("form_not_in_package", payload.zone_id)
    if not target.point_covered:
        reject_binding("point_outside_zone", payload.zone_id)
    return UploadTarget(
        organization_id=target.organization_id,
        site_id=target.site_id,
        form_version_id=target.form_version_id,
        definition=target.definition,
    )


def answer_values(payload: BoundObservationUpload) -> Answers:
    answers: Answers = {}
    for key, value in payload.answers.items():
        match value:
            case tuple():
                answers[key] = list(value)
            case str() | int() | float():
                answers[key] = value
            case _:
                assert_never(value)
    return answers


async def upload(
    session: AsyncSession,
    project_id: UUID,
    observation_id: UUID,
    user_id: UUID,
    payload: BoundObservationUpload,
) -> BoundUploadReceipt:
    await upload_receipts.authorize(session, project_id)
    identity = ReceiptIdentity(
        observation_id,
        project_id,
        user_id,
        fingerprint(project_id, observation_id, user_id, payload),
    )
    replay = await upload_receipts.replay(session, identity)
    if replay is not None:
        return replay.bound()
    target = validated_target(await bound_uploads.target(session, project_id, payload), payload)
    await bound_uploads.insert(
        session,
        bound_uploads.BoundWrite(
            identity, target, payload, validated_answers(target.definition, answer_values(payload))
        ),
    )
    receipt = await upload_receipts.committed(session, identity)
    return receipt.bound()
