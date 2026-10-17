"""Independent synthetic tenant matrix, including immutable field records."""

import json
from dataclasses import dataclass
from typing import Final
from uuid import UUID, uuid4

from fastapi.testclient import TestClient
from pydantic import JsonValue

from fieldmaps_api.zone_response_schemas import Publication
from tests.local_database import admin_sql
from tests.package_fixtures import submission
from tests.signing import Signer

ROLES: Final = ("owner", "admin", "member", "manager", "observer", "viewer")
TRAINING: Final = UUID("10000000-0000-4000-8000-000000000102")


@dataclass(frozen=True)
class Tenant:
    org: UUID
    project: UUID
    site: UUID
    form: UUID
    observation: UUID
    users: dict[str, UUID]

    @classmethod
    def new(cls) -> "Tenant":
        return cls(uuid4(), uuid4(), uuid4(), uuid4(), uuid4(), {role: uuid4() for role in ROLES})

    def variables(self) -> tuple[str, ...]:
        users = [
            {
                "id": str(user),
                "org_role": role if role in {"owner", "admin"} else "member",
                "project_role": role if role in {"manager", "observer", "viewer"} else None,
            }
            for role, user in self.users.items()
        ]
        return (
            f"org={self.org}",
            f"project={self.project}",
            f"site={self.site}",
            f"form={self.form}",
            f"observation={self.observation}",
            f"users={json.dumps(users)}",
            f"observer={self.users['observer']}",
        )


def create_tenant(tenant: Tenant, *, is_training: bool = False) -> None:
    admin_sql(
        "BEGIN; CREATE TEMP TABLE fixture_users ON COMMIT DROP AS "
        "SELECT * FROM jsonb_to_recordset(:'users'::jsonb) "
        "AS u(id uuid, org_role text, project_role text); "
        "INSERT INTO auth.users(id,instance_id,aud,role,email,email_confirmed_at) "
        "SELECT id,'00000000-0000-0000-0000-000000000000','authenticated',"
        "'authenticated',id::text||'@isolation.test',now() FROM fixture_users; "
        "INSERT INTO fieldmaps.profiles(user_id) SELECT id FROM fixture_users; "
        "INSERT INTO fieldmaps.organizations(id,name,slug) "
        "VALUES (:'org','Isolation organization',:'org'); "
        "INSERT INTO fieldmaps.projects(id,organization_id,name,code,is_training) "
        "VALUES (:'project',:'org','Isolation project','isolation-project',:'training'); "
        "INSERT INTO fieldmaps.organization_members(organization_id,user_id,role) "
        "SELECT :'org',id,org_role FROM fixture_users; "
        "INSERT INTO fieldmaps.project_memberships(organization_id,project_id,user_id,role) "
        "SELECT :'org',:'project',id,project_role FROM fixture_users "
        "WHERE project_role IS NOT NULL; "
        "INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name) "
        "VALUES (:'site',:'org',:'project','sample-garden','Isolation site'); "
        "INSERT INTO fieldmaps.forms(id,organization_id,project_id,code,name) "
        "VALUES (:'form',:'org',:'project','shell','Shell'); "
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,form_id,code,"
        "definition,version,state,published_at) "
        "SELECT :'form',:'org',:'project',:'form',code,definition,version,'published',now() "
        "FROM fieldmaps.form_versions "
        "WHERE project_id='10000000-0000-4000-8000-000000000002' AND code='shell-v1'; "
        "COMMIT;",
        *tenant.variables(),
        f"training={str(is_training).lower()}",
    )


def cleanup_tenant(tenant: Tenant) -> None:
    # Published fixtures are immutable. Suppress triggers only inside this cleanup transaction.
    admin_sql(
        "BEGIN; SET LOCAL session_replication_role=replica; "
        "DELETE FROM fieldmaps.package_checks WHERE package_id IN "
        "(SELECT id FROM fieldmaps.site_packages WHERE organization_id=:'org'); "
        "DELETE FROM fieldmaps.site_packages WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.observations WHERE organization_id=:'org' OR created_by IN "
        "(SELECT (value->>'id')::uuid FROM jsonb_array_elements(:'users'::jsonb)); "
        "DELETE FROM fieldmaps.invitations WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.form_versions WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.forms WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.sites WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.project_memberships WHERE organization_id=:'org' OR user_id IN "
        "(SELECT (value->>'id')::uuid FROM jsonb_array_elements(:'users'::jsonb)); "
        "DELETE FROM fieldmaps.organization_members WHERE organization_id=:'org' OR user_id IN "
        "(SELECT (value->>'id')::uuid FROM jsonb_array_elements(:'users'::jsonb)); "
        "DELETE FROM fieldmaps.projects WHERE organization_id=:'org'; "
        "DELETE FROM fieldmaps.organizations WHERE id=:'org'; "
        "DELETE FROM fieldmaps.profiles WHERE user_id IN "
        "(SELECT (value->>'id')::uuid FROM jsonb_array_elements(:'users'::jsonb)); "
        "DELETE FROM auth.users WHERE id IN "
        "(SELECT (value->>'id')::uuid FROM jsonb_array_elements(:'users'::jsonb)); COMMIT;",
        *tenant.variables(),
    )


def sign_in(client: TestClient, signer: Signer, user: UUID) -> None:
    client.headers["Authorization"] = f"Bearer {signer.issue(user)}"


def create_package(client: TestClient, signer: Signer, tenant: Tenant) -> UUID:
    sign_in(client, signer, tenant.users["manager"])
    response = client.post(
        f"/v1/projects/{tenant.project}/packages",
        json=submission(site_id=str(tenant.site)),
    )
    assert response.status_code == 201, response.text
    publication = Publication.model_validate_json(response.content)
    return publication.package.package_id


def observation_payload(
    site_id: UUID | None = None,
    package_id: UUID | None = None,
    zone_id: UUID | None = None,
) -> dict[str, JsonValue]:
    return {
        "site_id": str(site_id or UUID("10000000-0000-4000-8000-000000000003")),
        "package_id": str(package_id or uuid4()),
        "zone_id": str(zone_id or uuid4()),
        "form_version": "shell-v1",
        "coordinates": [-76.485, 42.448],
        "observer": "QA",
        "round_type": "standard",
        "first_round": True,
        "placement": "hand",
        "answers": {"people": 3, "notes": ""},
        "observed_at": "2026-09-17T12:00:00Z",
    }
