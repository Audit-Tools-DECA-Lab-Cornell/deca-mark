from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, Path, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fieldmaps_api.deps import Authentication, user_transaction
from fieldmaps_api.errors import ERROR_RESPONSES
from fieldmaps_api.form_schemas import (
    DraftCreate,
    DraftUpdate,
    FormCreate,
    FormSummary,
    FormVersionDetail,
)
from fieldmaps_api.services import forms

type VersionCode = Annotated[str, Path(min_length=1, max_length=100)]


def create_router(
    sessions: async_sessionmaker[AsyncSession], authenticate: Authentication
) -> APIRouter:
    router = APIRouter(responses=ERROR_RESPONSES)

    def precondition(
        request: Request,
        if_match: Annotated[
            str | None,
            Header(description="Required strong ETag of the loaded or reviewed form draft"),
        ] = None,
    ) -> str | None:
        return ",".join(request.headers.getlist("if-match")) or if_match

    @router.get("/v1/projects/{project_id}/forms", operation_id="listForms")
    async def form_list(
        project_id: UUID, user_id: Annotated[UUID, Depends(authenticate)]
    ) -> list[FormSummary]:
        """List the project's forms and their versions; drafts only to the project's managers."""
        async with user_transaction(sessions, user_id) as session:
            return await forms.list_forms(session, project_id)

    @router.post("/v1/projects/{project_id}/forms", status_code=201, operation_id="createForm")
    async def form_create(
        project_id: UUID,
        payload: FormCreate,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> FormVersionDetail:
        """Start a form with its first draft, checked as the collector will read it."""
        async with user_transaction(sessions, user_id) as session:
            return await forms.create_form(session, project_id, payload)

    @router.post(
        "/v1/projects/{project_id}/forms/{form_code}/versions",
        status_code=201,
        operation_id="createFormDraft",
    )
    async def draft_create(
        project_id: UUID,
        form_code: VersionCode,
        payload: DraftCreate,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> FormVersionDetail:
        """Start the form's next version as a draft, copied from its newest version by default."""
        async with user_transaction(sessions, user_id) as session:
            return await forms.create_draft(session, project_id, form_code, payload)

    @router.get(
        "/v1/projects/{project_id}/form-versions/{version_code}", operation_id="getFormVersion"
    )
    async def version_detail(
        response: Response,
        project_id: UUID,
        version_code: VersionCode,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> FormVersionDetail:
        async with user_transaction(sessions, user_id) as session:
            result = await forms.get_version(session, project_id, version_code)
            response.headers["ETag"] = result.etag
            return result

    @router.put(
        "/v1/projects/{project_id}/form-versions/{version_code}", operation_id="saveFormDraft"
    )
    async def draft_save(  # noqa: PLR0913, PLR0917 - HTTP inputs and response headers
        response: Response,
        project_id: UUID,
        version_code: VersionCode,
        payload: DraftUpdate,
        user_id: Annotated[UUID, Depends(authenticate)],
        if_match: Annotated[str | None, Depends(precondition)],
    ) -> FormVersionDetail:
        """Replace the expected draft revision (If-Match). Missing: 428; stale: 412."""
        async with user_transaction(sessions, user_id) as session:
            result = await forms.update_draft(session, project_id, version_code, payload, if_match)
            response.headers["ETag"] = result.etag
            return result

    @router.delete(
        "/v1/projects/{project_id}/form-versions/{version_code}",
        status_code=204,
        response_class=Response,
        operation_id="discardFormDraft",
    )
    async def draft_discard(
        project_id: UUID,
        version_code: VersionCode,
        user_id: Annotated[UUID, Depends(authenticate)],
        if_match: Annotated[str | None, Depends(precondition)],
    ) -> Response:
        async with user_transaction(sessions, user_id) as session:
            await forms.discard_draft(session, project_id, version_code, if_match)
        return Response(status_code=204)

    @router.post(
        "/v1/projects/{project_id}/form-versions/{version_code}/publish",
        operation_id="publishFormVersion",
    )
    async def version_publish(
        project_id: UUID,
        version_code: VersionCode,
        user_id: Annotated[UUID, Depends(authenticate)],
        if_match: Annotated[str | None, Depends(precondition)],
    ) -> FormVersionDetail:
        """Freeze exactly the reviewed If-Match revision. Missing: 428; stale: 412."""
        async with user_transaction(sessions, user_id) as session:
            return await forms.publish(session, project_id, version_code, if_match)

    @router.post(
        "/v1/projects/{project_id}/form-versions/{version_code}/retire",
        operation_id="retireFormVersion",
    )
    async def version_retire(
        project_id: UUID,
        version_code: VersionCode,
        user_id: Annotated[UUID, Depends(authenticate)],
    ) -> FormVersionDetail:
        """Stop new collection with a version. Records already made with it still upload."""
        async with user_transaction(sessions, user_id) as session:
            return await forms.retire(session, project_id, version_code)

    return router
