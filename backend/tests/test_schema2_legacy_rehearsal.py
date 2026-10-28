import subprocess

import pytest

from fieldmaps_api.form_schema_preflight import PreflightReport
from fieldmaps_api.form_schema_upgrade import (
    PRESERVATION_MIGRATION,
    SNAPSHOT_SQL,
    application_sql,
    psql,
    snapshot_report,
)
from tests import test_schema2_migration_rehearsal as original_rehearsal
from tests.test_schema2_bundle import cli
from tests.test_schema2_migration_rehearsal import ROOT, protected_state

pytestmark = pytest.mark.integration
schema2_container = original_rehearsal.schema2_container


def old_installation(container: str) -> None:
    psql(
        container,
        "ALTER TABLE fieldmaps.form_versions DISABLE TRIGGER immutable_form_version; "
        "UPDATE fieldmaps.form_versions SET definition="
        '\'{"fields":[{"code":"people","type":"integer","minimum":0,'
        '"maximum":999,"required":true},{"code":"notes","type":"text",'
        '"required":false,"maxLength":1000}],"status":"practice-only"}\'::jsonb '
        "WHERE id='10000000-0000-4000-8000-000000000004'; "
        "ALTER TABLE fieldmaps.form_versions ENABLE TRIGGER immutable_form_version;",
    )


def frozen_records(container: str) -> str:
    return psql(
        container,
        "SELECT jsonb_build_object("
        "'forms',(SELECT jsonb_agg(to_jsonb(f)-'schema_version' ORDER BY id) "
        "FROM fieldmaps.form_versions f),"
        "'observations',(SELECT jsonb_agg(to_jsonb(o) ORDER BY id) FROM fieldmaps.observations o),"
        "'packages',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM fieldmaps.site_packages p),"
        "'zones',(SELECT jsonb_agg(to_jsonb(z) ORDER BY package_id,zone_id) "
        "FROM fieldmaps.package_zones z));",
    )


def test_operator_bundle_preserves_legacy_records_packages_and_trigger(
    schema2_container: str,
) -> None:
    container = schema2_container
    old_installation(container)
    psql(container, (ROOT / "supabase/seed.sql").read_text())
    psql(
        container,
        (ROOT / "database/tests/current-fixture-helper.sql").read_text()
        + """
BEGIN;
SELECT pg_temp.fixture_package('10000000-0000-4000-8000-000000000003',
 '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000004');
SET LOCAL ROLE fieldmaps_api;
SELECT set_config('fieldmaps.user_id','50000000-0000-4000-8000-000000000001',true);
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
 observer_code,observed_at,geom,answers,created_by,upload_hash,package_id,zone_id,
 round_type,first_round,placement_source)
VALUES('93000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
 '10000000-0000-4000-8000-000000000004','QA','2026-09-17T12:00:00Z',
 fieldmaps.make_point(-76.5,42.5),'{"people":0,"notes":""}',
 '50000000-0000-4000-8000-000000000001',repeat('c',64),
 '91000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001',
 'standard',true,'hand');
COMMIT;
""",
    )
    before = frozen_records(container)
    bundle = cli("prepare", psql(container, SNAPSHOT_SQL))
    assert bundle.returncode == 0, bundle.stderr
    psql(container, bundle.stdout)
    assert frozen_records(container) == before
    assert (
        psql(container, "SELECT count(*) FROM fieldmaps.form_versions WHERE schema_version<>2;")
        == "0"
    )
    assert (
        psql(
            container,
            "SELECT statements[1] FROM supabase_migrations.schema_migrations "
            "WHERE version='20261024090000';",
        )
        == PRESERVATION_MIGRATION.read_text().strip()
    )
    state = protected_state(container)
    with pytest.raises(subprocess.CalledProcessError):
        psql(container, bundle.stdout)
    assert protected_state(container) == state
    with pytest.raises(subprocess.CalledProcessError):
        psql(
            container,
            "UPDATE fieldmaps.form_versions SET definition='{}' "
            "WHERE id='10000000-0000-4000-8000-000000000004';",
        )
    assert protected_state(container) == state


@pytest.mark.parametrize("fault", ["missing", "stale", "incomplete", "misclassified", "history"])
def test_preservation_refusal_rolls_back_every_protected_value(
    schema2_container: str, fault: str
) -> None:
    container = schema2_container
    old_installation(container)
    report = snapshot_report(container)
    if fault == "stale":
        psql(
            container,
            "ALTER TABLE fieldmaps.form_versions DISABLE TRIGGER immutable_form_version; "
            "UPDATE fieldmaps.form_versions SET definition=definition || '{\"changed\":true}' "
            "WHERE id='10000000-0000-4000-8000-000000000004'; "
            "ALTER TABLE fieldmaps.form_versions ENABLE TRIGGER immutable_form_version;",
        )
    if fault == "incomplete":
        report = PreflightReport.model_validate({**report.model_dump(), "rows": report.rows[:1]})
    if fault == "misclassified":
        report = PreflightReport.model_validate(
            {
                **report.model_dump(),
                "rows": [
                    row.model_copy(update={"definition_format": "legacy_fields"})
                    for row in report.rows
                ],
            }
        )
    if fault == "history":
        psql(
            container,
            "INSERT INTO supabase_migrations.schema_migrations(version) VALUES ('20261024090000');",
        )
    before = protected_state(container)
    sql = PRESERVATION_MIGRATION.read_text()
    if fault != "missing":
        sql = application_sql(report, sql)
    with pytest.raises(subprocess.CalledProcessError):
        psql(container, sql)
    assert protected_state(container) == before
