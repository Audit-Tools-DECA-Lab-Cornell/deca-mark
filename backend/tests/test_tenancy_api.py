from collections.abc import Iterator
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import TypeAdapter

from fieldmaps_api.invitation_schemas import (
    Invitation,
    InvitationCreated,
    InvitationPreview,
    InvitationRedeemed,
)
from fieldmaps_api.tenancy_schemas import Organization, Project
from tests.local_database import admin_sql
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in


@pytest.fixture
def tenant(api_client: TestClient, signer: Signer) -> Iterator[Tenant]:
    value = Tenant.new()
    create_tenant(value)
    sign_in(api_client, signer, value.users["owner"])
    try:
        yield value
    finally:
        cleanup_tenant(value)


@pytest.fixture
def recipient() -> Iterator[UUID]:
    user = uuid4()
    admin_sql(
        "INSERT INTO auth.users(id,instance_id,aud,role,email,email_confirmed_at) VALUES "
        "(:'user','00000000-0000-0000-0000-000000000000','authenticated',"
        "'authenticated',:'user'||'@recipient.test',now());",
        f"user={user}",
    )
    try:
        yield user
    finally:
        admin_sql("DELETE FROM auth.users WHERE id=:'user';", f"user={user}")


def test_organization_creation_requires_identity(validation_client: TestClient) -> None:
    validation_client.headers.pop("Authorization")
    response = validation_client.post("/v1/orgs", json={})
    assert response.status_code == 401


@pytest.mark.integration
def test_organization_and_project_updates(api_client: TestClient, tenant: Tenant) -> None:
    org = f"/v1/orgs/{tenant.org}"
    response = api_client.patch(org, json={"name": "Renamed", "slug": str(uuid4())})
    assert response.status_code == 200, response.text
    assert Organization.model_validate_json(response.content).name == "Renamed"
    created = api_client.post(
        f"{org}/projects", json={"name": "Second", "code": "second", "timezone": "UTC"}
    )
    assert created.status_code == 201, created.text
    project = Project.model_validate_json(created.content)
    changed = api_client.patch(
        f"/v1/projects/{project.project_id}", json={"description": "Study", "status": "archived"}
    )
    assert changed.status_code == 200, changed.text
    assert Project.model_validate_json(changed.content).description == "Study"
    cleared = api_client.patch(f"/v1/projects/{project.project_id}", json={"description": None})
    assert Project.model_validate_json(cleared.content).description is None
    assert Project.model_validate_json(cleared.content).status == "archived"
    assert api_client.get(f"{org}/projects").status_code == 200
    assert api_client.get("/v1/orgs").status_code == 200


@pytest.mark.integration
@pytest.mark.parametrize("scope", ["orgs", "projects"])
def test_invitation_preview_redeem_and_secret_hiding(
    api_client: TestClient, signer: Signer, tenant: Tenant, recipient: UUID, scope: str
) -> None:
    identifier = tenant.org if scope == "orgs" else tenant.project
    role = "member" if scope == "orgs" else "observer"
    url = f"/v1/{scope}/{identifier}/invitations"
    created = api_client.post(url, json={"role": role, "max_uses": 2})
    assert created.status_code == 201, created.text
    invite = InvitationCreated.model_validate_json(created.content)
    assert len(invite.token) == 43
    assert len(invite.code) == 8
    listing = api_client.get(url)
    assert "token" not in listing.text
    assert "code" not in listing.text
    assert "hash" not in listing.text
    assert TypeAdapter(list[Invitation]).validate_json(listing.content)[0].use_count == 0
    sign_in(api_client, signer, recipient)
    preview = api_client.post("/v1/invitations/preview", json={"token": invite.token})
    assert preview.status_code == 200, preview.text
    assert InvitationPreview.model_validate_json(preview.content).role == role
    code = invite.code[:4].lower() + "-" + invite.code[4:].lower()
    redeemed = api_client.post("/v1/invitations/redeem", json={"code": code})
    assert redeemed.status_code == 200, redeemed.text
    assert InvitationRedeemed.model_validate_json(redeemed.content).organization_id == tenant.org
    sign_in(api_client, signer, tenant.users["owner"])
    assert (
        TypeAdapter(list[Invitation]).validate_json(api_client.get(url).content)[0].use_count == 1
    )
    assert api_client.delete(f"{url}/{invite.id}").status_code == 204
    assert (
        api_client.post("/v1/invitations/preview", json={"token": invite.token}).status_code == 404
    )


@pytest.mark.integration
def test_member_changes_and_transfer(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    member = tenant.users["member"]
    org = f"/v1/orgs/{tenant.org}"
    project = f"/v1/projects/{tenant.project}"
    assert api_client.patch(f"{org}/members/{member}", json={"role": "admin"}).status_code == 204
    assert (
        api_client.patch(
            f"{project}/members/{tenant.users['observer']}", json={"role": "viewer"}
        ).status_code
        == 204
    )
    assert api_client.delete(f"{project}/members/{tenant.users['viewer']}").status_code == 204
    assert api_client.delete(f"{org}/members/{tenant.users['observer']}").status_code == 204
    transfer = api_client.post(f"{org}/transfer-ownership", json={"user_id": str(member)})
    assert transfer.status_code == 204, transfer.text
    sign_in(api_client, signer, member)
    assert api_client.get(f"{org}/members").status_code == 200


@pytest.mark.integration
def test_email_bound_rejection_does_not_consume_invitation(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    url = f"/v1/orgs/{tenant.org}/invitations"
    created = api_client.post(url, json={"role": "member", "email": "Different@Example.COM"})
    assert created.status_code == 201, created.text
    invitation = InvitationCreated.model_validate_json(created.content)
    assert invitation.email == "different@example.com"
    sign_in(api_client, signer, tenant.users["member"])
    response = api_client.post("/v1/invitations/redeem", json={"token": invitation.token})
    assert response.status_code == 404, response.text
    assert (
        admin_sql(
            "SELECT use_count FROM fieldmaps.invitations WHERE id=:'id';", f"id={invitation.id}"
        )
        == "0"
    )


@pytest.mark.integration
def test_organization_creation_is_atomic_with_limits_and_slug_conflicts(
    api_client: TestClient, tenant: Tenant
) -> None:
    assert tenant.org
    created_ids: list[str] = []
    payload = {
        "name": "New organization",
        "slug": str(uuid4()),
        "project": {"name": "First", "code": "first"},
    }
    try:
        first = api_client.post("/v1/orgs", json=payload)
        assert first.status_code == 201, first.text
        org = Organization.model_validate_json(first.content)
        created_ids.append(str(org.id))
        projects = api_client.get(f"/v1/orgs/{org.id}/projects")
        project = TypeAdapter(list[Project]).validate_json(projects.content)[0]
        assert project.role == "manager"
        assert project.code == "first"
        assert api_client.post("/v1/orgs", json=payload).status_code == 409
        second = api_client.post("/v1/orgs", json={**payload, "slug": str(uuid4())})
        assert second.status_code == 201, second.text
        created_ids.append(str(Organization.model_validate_json(second.content).id))
        limited = api_client.post("/v1/orgs", json={**payload, "slug": str(uuid4())})
        assert limited.status_code == 403, limited.text
    finally:
        for org_id in created_ids:
            admin_sql(
                "BEGIN; SET LOCAL session_replication_role=replica; "
                "DELETE FROM fieldmaps.project_memberships WHERE organization_id=:'org'; "
                "DELETE FROM fieldmaps.organization_members WHERE organization_id=:'org'; "
                "DELETE FROM fieldmaps.projects WHERE organization_id=:'org'; "
                "DELETE FROM fieldmaps.organizations WHERE id=:'org'; COMMIT;",
                f"org={org_id}",
            )


@pytest.mark.integration
@pytest.mark.parametrize("expired", [False, True])
def test_invitation_expiry_and_use_limit(
    api_client: TestClient, signer: Signer, tenant: Tenant, *, expired: bool
) -> None:
    created = api_client.post(
        f"/v1/projects/{tenant.project}/invitations", json={"role": "observer"}
    )
    assert created.status_code == 201, created.text
    invitation = InvitationCreated.model_validate_json(created.content)
    sign_in(api_client, signer, tenant.users["member"])
    if expired:
        admin_sql(
            "UPDATE fieldmaps.invitations SET expires_at=now()-interval '1 second' WHERE id=:'id';",
            f"id={invitation.id}",
        )
        response = api_client.post("/v1/invitations/redeem", json={"token": invitation.token})
        assert response.status_code == 410, response.text
    else:
        first = api_client.post("/v1/invitations/redeem", json={"token": invitation.token})
        assert first.status_code == 200, first.text
        second = api_client.post("/v1/invitations/redeem", json={"token": invitation.token})
        assert second.status_code == 404, second.text
    assert admin_sql(
        "SELECT use_count FROM fieldmaps.invitations WHERE id=:'id';", f"id={invitation.id}"
    ) == ("0" if expired else "1")


@pytest.mark.integration
def test_org_projects_only_lists_assigned_projects_for_member(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    unassigned = api_client.post(
        f"/v1/orgs/{tenant.org}/projects", json={"name": "Private study", "code": "private-study"}
    )
    assert unassigned.status_code == 201, unassigned.text
    sign_in(api_client, signer, tenant.users["observer"])
    response = api_client.get(f"/v1/orgs/{tenant.org}/projects")
    assert response.status_code == 200, response.text
    projects = TypeAdapter(list[Project]).validate_json(response.content)
    assert [project.project_id for project in projects] == [tenant.project]
    foreign = api_client.get("/v1/orgs/10000000-0000-4000-8000-000000000001/projects")
    assert foreign.status_code == 404, foreign.text
