"""Forward migration on an authentic pre-audit schema; explicit rehearsal only."""

import json
from hashlib import sha256
from pathlib import Path
from typing import cast
from uuid import UUID, uuid4

import pytest
from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from pydantic import JsonValue
from tests.conftest import signer
from tests.local_database import admin_sql, disposable_database_selected
from tests.package_fixtures import submission
from tests.tenant_fixtures import Tenant, observation_payload
from tests.test_consolidated_audit import audit_api, instrument, live_api
from tests.test_observation_analysis_exports import files
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import document

__all__ = ["audit_api", "live_api", "signer"]
pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[2]


def frozen_state(tenant: Tenant) -> dict[str, JsonValue]:
    return document(
        admin_sql(
            "SELECT jsonb_build_object("
            "'forms',(SELECT jsonb_agg(to_jsonb(f)-'revision' ORDER BY f.id) FROM fieldmaps.form_versions f WHERE project_id=:'project'),"
            "'observations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM fieldmaps.observations o WHERE project_id=:'project'),"
            "'packages',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM fieldmaps.site_packages p WHERE project_id=:'project'),"
            "'zones',(SELECT jsonb_agg(to_jsonb(z) ORDER BY z.package_id,z.zone_id) FROM fieldmaps.package_zones z WHERE project_id=:'project'),"
            "'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.user_id) FROM fieldmaps.project_memberships m WHERE project_id=:'project'),"
            "'table_acl',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'acl',c.relacl::text) ORDER BY c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='fieldmaps' AND c.relkind IN ('r','v')),"
            "'column_acl',(SELECT jsonb_agg(to_jsonb(g) ORDER BY g.table_name,g.column_name,g.grantee,g.privilege_type) FROM information_schema.column_privileges g WHERE table_schema='fieldmaps' AND column_name<>'revision'),"
            "'roles',(SELECT jsonb_agg(jsonb_build_object('name',rolname,'superuser',rolsuper,'bypassrls',rolbypassrls) ORDER BY rolname) FROM pg_roles WHERE rolname IN ('fieldmaps_api','fieldmaps_sample_reader')),"
            "'baseline_ledger',(SELECT jsonb_agg(to_jsonb(m)) FROM fieldmaps_meta.schema_migrations m));",
            *tenant.variables(),
        ).encode()
    )


def seed_versions(tenant: Tenant) -> tuple[UUID, UUID, str]:
    published, draft, legacy = uuid4(), uuid4(), uuid4()
    canonical = instrument()
    canonical_questions = canonical["questions"]
    assert isinstance(canonical_questions, list)
    canonical["questions"] = canonical_questions[:2]
    definition = {
        "fields": [
            {
                "code": "ratio",
                "type": "number",
                "required": True,
                "minimum": 0,
                "maximum": 5,
            },
            {"code": "supervised", "type": "boolean"},
            {"code": "notes", "type": "text", "maxLength": 1000},
        ]
    }
    admin_sql(
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition,state) VALUES "
        "(:'published',:'org',:'project','forward-v1',:'canonical'::jsonb||'{\"version\":\"forward-v1\",\"status\":\"published\"}','published'),"
        "(:'draft',:'org',:'project','forward-v2',:'canonical'::jsonb||'{\"version\":\"forward-v2\"}','draft'),"
        "(:'legacy',:'org',:'project','forward-legacy-v1',:'legacy_definition'::jsonb,'published');",
        *tenant.variables(),
        f"published={published}",
        f"draft={draft}",
        f"legacy={legacy}",
        f"canonical={json.dumps(canonical)}",
        f"legacy_definition={json.dumps(definition)}",
    )
    return published, draft, str(legacy)


def pre_migration_records(api: LiveApi) -> tuple[str, dict[str, JsonValue], bytes]:
    project = f"/v1/projects/{api.tenant.project}"
    with api.client() as manager:
        response = manager.post(
            f"{project}/packages", json=submission(site_id=str(api.tenant.site))
        )
        assert response.status_code == 201, response.text
        package = Publication.model_validate_json(response.content).package.package_id
        history = manager.get(
            f"{project}/sites/{api.tenant.site}/zones",
            params={"package_id": str(package)},
        )
        zone = HistoricalZones.model_validate_json(history.content).zones[0].zone_id
        body = observation_payload(api.tenant.site, package, zone)
        # A collaborator's otherwise identical observation demonstrates the old RLS scope.
        assert (
            manager.put(f"{project}/observations/{uuid4()}", json=body).status_code
            == 200
        )
    with api.client("observer") as observer:
        url = f"{project}/observations/{uuid4()}"
        accepted = observer.put(url, json=body)
        assert accepted.status_code == 200, accepted.text
        page = document(observer.get(f"{project}/observations").content)
        assert page["total_matching"] == 2
    return url, body, accepted.content


def seed_decimal_boolean_history(
    api: LiveApi, body: dict[str, JsonValue], legacy: str
) -> UUID:
    project = f"/v1/projects/{api.tenant.project}"
    with api.client() as manager:
        response = manager.post(
            f"{project}/packages",
            json=submission(
                site_id=str(api.tenant.site),
                expected_current_package_id=body["package_id"],
                form_version="forward-legacy-v1",
                zone_identity_map=[
                    {
                        "source_feature_id": "A",
                        "zone_id": body["zone_id"],
                        "zone_code": "A",
                    }
                ],
            ),
        )
        assert response.status_code == 201, response.text
        package = Publication.model_validate_json(response.content).package.package_id
    admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; SELECT set_config('fieldmaps.user_id',:'observer',true); "
        "INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,"
        "observer_code,observed_at,geom,answers,created_by,upload_hash,package_id,zone_id,round_type,first_round,placement_source) "
        "VALUES (:'id',:'org',:'project',:'site',:'legacy','QA','2026-10-10T12:00:00Z',"
        'fieldmaps.make_point(-76.485,42.448),\'{"ratio":1.25,"supervised":false,"notes":""}\','
        ":'observer',repeat('b',64),:'package',:'zone','standard',true,'hand'); COMMIT;",
        *api.tenant.variables(),
        f"id={uuid4()}",
        f"legacy={legacy}",
        f"package={package}",
        f"zone={body['zone_id']}",
    )
    return package


def seed_previously_publishable_inverted_history(
    api: LiveApi, body: dict[str, JsonValue], current: UUID
) -> tuple[UUID, UUID]:
    form, observation = uuid4(), uuid4()
    definition = instrument()
    questions = definition["questions"]
    assert isinstance(questions, list)
    assert isinstance(questions[0], dict)
    definition.update(
        version="forward-invalid-v1",
        status="published",
        questions=[
            {
                **questions[0],
                "required": False,
                "min": 10,
                "max": 1,
            }
        ],
    )
    admin_sql(
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition) "
        "VALUES (:'form',:'org',:'project','forward-invalid-v1',:'definition'::jsonb);",
        *api.tenant.variables(),
        f"form={form}",
        f"definition={json.dumps(definition)}",
    )
    with api.client() as manager:
        response = manager.post(
            f"/v1/projects/{api.tenant.project}/packages",
            json=submission(
                site_id=str(api.tenant.site),
                expected_current_package_id=str(current),
                form_version="forward-invalid-v1",
                zone_identity_map=[
                    {
                        "source_feature_id": "A",
                        "zone_id": body["zone_id"],
                        "zone_code": "A",
                    }
                ],
            ),
        )
        assert response.status_code == 201, response.text
        package = Publication.model_validate_json(response.content).package.package_id
    admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; SELECT set_config('fieldmaps.user_id',:'observer',true); "
        "INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,"
        "observer_code,observed_at,geom,answers,created_by,upload_hash,package_id,zone_id,round_type,first_round,placement_source) "
        "VALUES (:'id',:'org',:'project',:'site',:'form','QA','2026-10-10T12:00:00Z',"
        "fieldmaps.make_point(-76.485,42.448),'{}',:'observer',repeat('c',64),:'package',:'zone','standard',true,'hand'); COMMIT;",
        *api.tenant.variables(),
        f"id={observation}",
        f"form={form}",
        f"package={package}",
        f"zone={body['zone_id']}",
    )
    return observation, package


def test_pending_audit_migrations_preserve_existing_data_and_permissions(
    request: pytest.FixtureRequest, tmp_path: Path
) -> None:
    assert disposable_database_selected(), (
        "Forward acceptance requires disposable selection"
    )
    assert (
        admin_sql(
            "SELECT count(*) FROM information_schema.columns WHERE table_schema='fieldmaps' AND table_name='form_versions' AND column_name='revision';"
        )
        == "0"
    ), "Run the explicit pre-audit-schema harness"
    api = cast("LiveApi", request.getfixturevalue("audit_api"))
    published, draft, legacy = seed_versions(api.tenant)
    url, queued, receipt = pre_migration_records(api)
    decimal_package = seed_decimal_boolean_history(api, queued, legacy)
    invalid_record, invalid_package = seed_previously_publishable_inverted_history(
        api, queued, decimal_package
    )
    before = frozen_state(api.tenant)
    (tmp_path / "before.json").write_text(json.dumps(before, indent=2) + "\n")
    applied: list[dict[str, str]] = []
    for filename in (
        "20261017000657_observation_creator_visibility.sql",
        "20261017050453_form_draft_revisions.sql",
    ):
        migration = (ROOT / "supabase/migrations" / filename).read_bytes()
        admin_sql("BEGIN;\n" + migration.decode() + "\nCOMMIT;")
        applied.append({"file": filename, "sha256": sha256(migration).hexdigest()})
    after = frozen_state(api.tenant)
    assert before == after
    (tmp_path / "after.json").write_text(json.dumps(after, indent=2) + "\n")
    (tmp_path / "applied.json").write_text(json.dumps(applied, indent=2) + "\n")
    assert admin_sql("SELECT bool_and(revision=1) FROM fieldmaps.form_versions;") == "t"
    assert (
        admin_sql(
            "SELECT to_regprocedure('fieldmaps_private.publish_form_version(uuid,uuid)') IS NULL;"
        )
        == "t"
    )
    assert (
        admin_sql(
            "SELECT has_function_privilege('fieldmaps_api','fieldmaps_private.publish_form_version(uuid,uuid,bigint)','EXECUTE');"
        )
        == "t"
    )
    assert (
        admin_sql(
            "SELECT has_column_privilege('fieldmaps_api','fieldmaps.form_versions','revision','UPDATE');"
        )
        == "f"
    )
    project = f"/v1/projects/{api.tenant.project}"
    with api.client("observer") as observer:
        # Same committed UUID/body/receipt; another queue entry for its old package stays uploadable.
        assert observer.put(url, json=queued).content == receipt
        delayed = observer.put(f"{project}/observations/{uuid4()}", json=queued)
        assert delayed.status_code == 200, delayed.text
        detail = document(observer.get(url).content)
        assert detail["answers"] == {"people": 3, "notes": ""}
        assert (
            document(observer.get(f"{project}/observations").content)["total_matching"]
            == 4
        )
        assert observer.get(f"{project}/observations/export").status_code == 403
    with api.client() as manager:
        original = manager.get(f"{project}/form-versions/forward-v1")
        assert (
            FormVersionDetail.model_validate_json(original.content).version_id
            == published
        )
        current_url = f"{project}/form-versions/forward-v2"
        current = FormVersionDetail.model_validate_json(
            manager.get(current_url).content
        )
        assert current.version_id == draft
        edited = manager.put(
            current_url,
            headers={"If-Match": current.etag},
            json={"definition": current.definition},
        )
        assert edited.status_code == 200, edited.text
        assert (
            manager.post(
                current_url + "/publish", headers={"If-Match": current.etag}
            ).status_code
            == 412
        )
        assert manager.post(current_url + "/publish").status_code == 428
    with api.client("viewer") as viewer:
        # Stored interpretation retains the immutable pre-fix instrument, while
        # new authoring still rejects it. No historical definition is rewritten.
        whole = viewer.get(f"{project}/observations/export")
        assert whole.status_code == 200, whole.text
        assert viewer.get(f"{project}/observations/{invalid_record}").status_code == 200
        for format_name in ("csv", "geojson"):
            exported = viewer.get(
                f"{project}/observations/export",
                params={"format": format_name, "package_id": str(decimal_package)},
            )
            assert exported.status_code == 200, exported.text
            assets = files(exported.content)
            assert document(assets["forms.json"])["forward-legacy-v1"] == {
                "fields": [
                    {
                        "code": "ratio",
                        "type": "number",
                        "required": True,
                        "minimum": 0,
                        "maximum": 5,
                    },
                    {"code": "supervised", "type": "boolean"},
                    {"code": "notes", "type": "text", "maxLength": 1000},
                ]
            }
            (tmp_path / f"{format_name}.zip").write_bytes(exported.content)
        blocked = viewer.get(
            f"{project}/observations/export",
            params={"package_id": str(invalid_package)},
        )
        assert blocked.status_code == 200, blocked.text
    with api.client("observer") as observer:
        blocked_upload = observer.put(
            f"{project}/observations/{uuid4()}",
            json={
                **queued,
                "package_id": str(invalid_package),
                "form_version": "forward-invalid-v1",
                "answers": {},
            },
        )
        assert blocked_upload.status_code == 200, blocked_upload.text
    inventory = admin_sql(
        (
            ROOT
            / "docs/reviews/consolidated-audit-2026-10-17/canonical-bound-preflight.sql"
        ).read_text()
    )
    assert "forward-invalid-v1" in inventory
    (tmp_path / "canonical-bound-preflight.txt").write_text(inventory + "\n")
