"""Read slice against real restricted-role transactions; tags are SQL fixtures only."""

import json
import time
from collections.abc import Iterator
from dataclasses import dataclass
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter
from sqlalchemy import event
from sqlalchemy.engine import Engine

from fieldmaps_api.errors import StorageUnavailableError
from fieldmaps_api.library_schemas import Library, VariableUsage
from tests.local_database import admin_sql
from tests.signing import Signer
from tests.tenant_fixtures import Tenant, cleanup_tenant, create_tenant, sign_in

pytestmark = pytest.mark.integration
DOC = TypeAdapter(dict[str, JsonValue])


@dataclass(frozen=True)
class Scope:
    tenant: Tenant
    org_var: UUID
    project_var: UUID
    site_var: UUID
    dependent: UUID

    @property
    def url(self) -> str:
        return f"/v1/projects/{self.tenant.project}/library/variables"


@pytest.fixture
def scope(api_client: TestClient, signer: Signer) -> Iterator[Scope]:
    t = Tenant.new()
    create_tenant(t)
    result = Scope(t, uuid4(), uuid4(), uuid4(), uuid4())
    rows: list[dict[str, JsonValue]] = []
    for level, identity in [
        ("organization", result.org_var),
        ("project", result.project_var),
        ("site", result.site_var),
        ("site", result.dependent),
    ]:
        settings: dict[str, JsonValue] = {
            "label": "Synthetic variable",
            "exportColumn": "synthetic",
            "kind": "text",
            "hint": "Full settings",
            "maxLength": 100,
            "source": "API test fixture",
        }
        if identity == result.dependent:
            settings["dependsOn"] = {
                "kind": "all",
                "of": [{"kind": "answered", "question": str(result.org_var)}],
            }
        rows.append(
            {
                "id": str(identity),
                "level": level,
                "organization_id": str(t.org),
                "project_id": str(t.project) if level != "organization" else None,
                "site_id": str(t.site) if level == "site" else None,
                "code": "Dependent1" if identity == result.dependent else "Age1",
                "group_name": "Synthetic",
                "section": "Child",
                "settings": settings,
            }
        )
    admin_sql(
        "INSERT INTO "
        "fieldmaps.library_variables(id,level,organization_id,project_id,site_id,code,group_name,section,settings) "  # noqa: E501 - SQL column list
        "SELECT "
        "id,level,organization_id,project_id,site_id,code,group_name,section,settings "
        "FROM jsonb_to_recordset(:'rows') x(id uuid,level text,organization_id "
        "uuid,project_id uuid,site_id uuid,code text,group_name text,section "
        "text,settings jsonb);",
        f"rows={json.dumps(rows)}",
    )
    sign_in(api_client, signer, t.users["manager"])
    try:
        yield result
    finally:
        admin_sql(
            "DELETE FROM fieldmaps.library_variables WHERE organization_id=:'org';", f"org={t.org}"
        )
        cleanup_tenant(t)


def read_library(client: TestClient, url: str) -> Library:
    response = client.get(url)
    assert response.status_code == 200, response.text
    document = DOC.validate_json(response.content)
    variables = document["variables"]
    assert isinstance(variables, list)
    for entry in variables:
        assert isinstance(entry, dict)
        variable = entry["variable"]
        assert isinstance(variable, dict)
        assert variable.pop("etag")
    return Library.model_validate(document)


@pytest.mark.parametrize(
    "case",
    [
        ("owner", 200, 200),
        ("admin", 200, 200),
        ("manager", 200, 403),
        ("viewer", 200, 403),
        ("observer", 403, 403),
        ("member", 404, 403),
    ],
)
def test_read_roles(
    api_client: TestClient,
    signer: Signer,
    scope: Scope,
    case: tuple[str, int, int],
) -> None:
    role, project_status, org_status = case
    sign_in(api_client, signer, scope.tenant.users[role])
    assert api_client.get(scope.url).status_code == project_status
    assert (
        api_client.get(f"/v1/orgs/{scope.tenant.org}/library/variables").status_code == org_status
    )


def test_full_library_and_no_shadowing(
    api_client: TestClient, signer: Signer, scope: Scope
) -> None:
    data = read_library(api_client, scope.url)
    assert len(data.variables) == 14
    assert len([x for x in data.variables if x.variable.code == "Age1"]) == 4
    assert {x.variable.level for x in data.variables} == {
        "universal",
        "organization",
        "project",
        "site",
    }
    assert all(x.used_in_forms == 0 for x in data.variables)
    assert next(x for x in data.variables if x.variable.id == scope.org_var).can_edit is False
    own = next(x for x in data.variables if x.variable.id == scope.site_var)
    assert own.can_edit
    assert own.variable.settings.max_length == 100
    admin_sql(
        "INSERT INTO fieldmaps.sites(id,organization_id,project_id,name,code) VALUES "
        "(:'id',:'org',:'project','Empty','empty');",
        f"id={uuid4()}",
        f"org={scope.tenant.org}",
        f"project={scope.tenant.project}",
    )
    assert len(read_library(api_client, scope.url).sites) == 2
    sign_in(api_client, signer, scope.tenant.users["owner"])
    org = read_library(api_client, f"/v1/orgs/{scope.tenant.org}/library/variables")
    assert len(org.variables) == 11
    assert org.sites == []
    assert next(
        x for x in read_library(api_client, scope.url).variables if x.variable.id == scope.org_var
    ).can_edit


def test_usage_is_distinct_forms_and_readable_versions(
    api_client: TestClient, signer: Signer, scope: Scope
) -> None:
    url = f"{scope.url}/{scope.org_var}"
    before = api_client.get(url)
    tag = {"variableId": str(scope.org_var)}
    questions = json.dumps([{"id": "a", "librarySource": tag}, {"id": "b", "librarySource": tag}])
    # Unknown tag properties are direct privileged fixtures, never API-authored.
    admin_sql(
        "INSERT INTO "
        "fieldmaps.form_versions(id,organization_id,project_id,form_id,code,version,state,definition) "  # noqa: E501 - SQL column list
        " "
        "SELECT "
        "gen_random_uuid(),organization_id,project_id,form_id,'library-fixture-'||n,n,'draft',"
        "jsonb_build_object('title','Fixture version','questions',:'questions'::jsonb) "
        "FROM fieldmaps.form_versions CROSS JOIN generate_series(2,3)n WHERE id=:'form';",
        f"questions={questions}",
        f"form={scope.tenant.form}",
    )
    related = uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.forms(id,organization_id,project_id,code,name) "
        "VALUES (:'related',:'org',:'project','related','Related form'); "
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,form_id,"
        "code,version,state,published_at,definition) SELECT gen_random_uuid(),:'org',"
        ":'project',:'related','related-'||n,n,CASE WHEN n=1 THEN 'published' ELSE 'retired' END,"
        "now(),jsonb_build_object('title','Related version','questions',:'questions'::jsonb) "
        "FROM generate_series(1,2)n;",
        f"related={related}",
        f"org={scope.tenant.org}",
        f"project={scope.tenant.project}",
        f"questions={questions}",
    )
    usage = VariableUsage.model_validate_json(api_client.get(url + "/usage").content)
    assert usage.used_in_forms == 2
    assert len(usage.forms) == 2
    assert len(usage.forms[0].versions) == 2
    assert usage.templates == []
    assert [x.id for x in usage.dependent_variables] == [scope.dependent]
    assert (
        next(
            x
            for x in read_library(api_client, scope.url).variables
            if x.variable.id == scope.org_var
        ).used_in_forms
        == 2
    )
    after = api_client.get(url)
    assert after.headers["etag"] == before.headers["etag"]
    assert after.content == before.content
    assert after.headers["cache-control"] == "private, no-store"
    sign_in(api_client, signer, scope.tenant.users["viewer"])
    assert (
        VariableUsage.model_validate_json(api_client.get(url + "/usage").content).used_in_forms == 1
    )


def test_scope_denial_revocation_and_read_failures(
    api_client: TestClient, scope: Scope, monkeypatch: pytest.MonkeyPatch
) -> None:
    other = Tenant.new()
    create_tenant(other)
    try:
        foreign = uuid4()
        admin_sql(
            "INSERT INTO "
            "fieldmaps.library_variables(id,level,organization_id,code,group_name,section,settings) "  # noqa: E501 - SQL column list
            "VALUES "
            '(:\'id\',\'organization\',:\'org\',\'Secret1\',\'Secret\',\'Child\',\'{"label":"Secret","kind":"text","exportColumn":"secret","source":"fixture"}\');',
            f"id={foreign}",
            f"org={other.org}",
        )
        for suffix in ["", "/usage"]:
            response = api_client.get(f"{scope.url}/{foreign}{suffix}")
            assert response.status_code == 404
            assert "Secret" not in response.text
        assert api_client.get(f"/v1/projects/{other.project}/library/variables").status_code == 404
    finally:
        admin_sql(
            "DELETE FROM fieldmaps.library_variables WHERE organization_id=:'org';",
            f"org={other.org}",
        )
        cleanup_tenant(other)
    assert api_client.get(scope.url + "?q=age").status_code == 422
    assert api_client.post(scope.url, json={}).status_code == 405

    async def failed(*_args: object, **_kwargs: object) -> Library:
        raise StorageUnavailableError

    monkeypatch.setattr("fieldmaps_api.repositories.library.read", failed)
    assert api_client.get(scope.url).status_code == 503
    monkeypatch.undo()
    admin_sql(
        "DELETE FROM fieldmaps.project_memberships WHERE user_id=:'user' AND "
        "project_id=:'project';",
        f"user={scope.tenant.users['manager']}",
        f"project={scope.tenant.project}",
    )
    assert api_client.get(scope.url).status_code == 404
    api_client.headers.pop("Authorization")
    assert api_client.get(scope.url).status_code == 401


def test_bounded_read_queries_and_http_measurement(api_client: TestClient, scope: Scope) -> None:
    statements: list[str] = []

    def capture(
        _conn: object,
        _cursor: object,
        statement: str,
        _params: object,
        _context: object,
        _many: object,
    ) -> None:
        statements.append(statement)

    event.listen(Engine, "before_cursor_execute", capture)
    timings: list[float] = []
    response_bytes = 0
    try:
        for _ in range(6):
            statements.clear()
            start = time.perf_counter()
            response = api_client.get(scope.url)
            timings.append((time.perf_counter() - start) * 1000)
            response_bytes = len(response.content)
            assert response.status_code == 200, response.text
            assert sum("WITH abilities" in x for x in statements) == 1
            assert len(statements) == 4  # identity, active caller, context, single full read
        print(  # noqa: T201 - explicit local measurement output
            f"Library HTTP: 14 variables, warm p95={max(timings[1:]):.3f} ms, "
            f"bytes={response_bytes}"
        )
    finally:
        event.remove(Engine, "before_cursor_execute", capture)


def test_stress_http_measurement(api_client: TestClient, scope: Scope) -> None:
    """10x visible library plus the separately assumed version stress workload."""
    admin_sql(
        "INSERT INTO fieldmaps.library_variables(level,organization_id,project_id,code,group_name,section,settings) "  # noqa: E501 - SQL column list
        "SELECT 'project',:'org',:'project','Stress'||n,'Synthetic stress','Record',"
        "jsonb_build_object('label','Synthetic stress '||n,'kind','text',"
        "'exportColumn','stress_'||n,'source','Synthetic stress') FROM generate_series(1,5686)n;"
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,form_id,"
        "code,version,state,definition) SELECT gen_random_uuid(),:'org',:'project',:'form',"
        "'stress-'||n,n,'draft',jsonb_build_object('questions',(SELECT jsonb_agg("
        "jsonb_build_object('id','q'||q,'librarySource',jsonb_build_object('variableId',"
        ":'variable'))) FROM generate_series(1,100)q)) FROM generate_series(2,10001)n; "
        "ANALYZE fieldmaps.library_variables; ANALYZE fieldmaps.form_versions;",
        f"org={scope.tenant.org}",
        f"project={scope.tenant.project}",
        f"form={scope.tenant.form}",
        f"variable={scope.org_var}",
    )
    timings: list[float] = []
    size = 0
    for _ in range(6):
        start = time.perf_counter()
        response = api_client.get(scope.url)
        timings.append((time.perf_counter() - start) * 1000)
        assert response.status_code == 200, response.text
        document = DOC.validate_json(response.content)
        variables = document["variables"]
        assert isinstance(variables, list)
        assert len(variables) == 5700
        size = len(response.content)
    print(  # noqa: T201 - explicit reproducible stress measurement
        f"Stress HTTP: 5700 variables, 10000 versions x 100 tags, "
        f"warm p95={max(timings[1:]):.3f} ms, bytes={size}"
    )


def test_owner_scope_and_deleted_caller(
    api_client: TestClient, signer: Signer, scope: Scope
) -> None:
    sign_in(api_client, signer, scope.tenant.users["owner"])
    org_url = f"/v1/orgs/{scope.tenant.org}/library/variables"
    assert api_client.get(f"{org_url}/{scope.project_var}").status_code == 404
    sibling = uuid4()
    foreign = uuid4()
    admin_sql(
        "INSERT INTO fieldmaps.projects(id,organization_id,name,code) "
        "VALUES (:'sibling',:'org','Sibling','sibling'); "
        "INSERT INTO fieldmaps.library_variables(id,level,organization_id,project_id,"
        "code,group_name,section,settings) VALUES (:'foreign','project',:'org',:'sibling',"
        '\'Sibling1\',\'Synthetic\',\'Record\',\'{"label":"Sibling","kind":"text",'
        '"exportColumn":"sibling","source":"fixture"}\');',
        f"sibling={sibling}",
        f"foreign={foreign}",
        f"org={scope.tenant.org}",
    )
    try:
        assert len(read_library(api_client, scope.url).variables) == 14
        assert api_client.get(f"{scope.url}/{foreign}/usage").status_code == 404
    finally:
        admin_sql(
            "DELETE FROM fieldmaps.library_variables WHERE id=:'id'; "
            "DELETE FROM fieldmaps.projects WHERE id=:'project';",
            f"id={foreign}",
            f"project={sibling}",
        )
    sign_in(api_client, signer, scope.tenant.users["manager"])
    admin_sql(
        "UPDATE fieldmaps.profiles SET deleted_at=now() WHERE user_id=:'id';",
        f"id={scope.tenant.users['manager']}",
    )
    response = api_client.get(scope.url)
    assert response.status_code == 403
    assert "account_deleted" in response.text
