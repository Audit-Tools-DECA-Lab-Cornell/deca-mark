"""Forward-only recovery migration over synthetic retained pre-recovery data."""

# ruff: noqa: INP001, S101 -- cross-directory pytest acceptance, not a package

from pathlib import Path
from typing import TYPE_CHECKING, cast
from uuid import uuid4

import pytest
from tests.conftest import signer
from tests.fields_only_fixtures import seed_history
from tests.local_database import admin_sql, disposable_database_selected
from tests.test_account_deletion_recovery import application, eventually, forget, state
from tests.test_consolidated_audit import audit_api, live_api

if TYPE_CHECKING:
    from tests.test_zone_api_live import LiveApi

import httpx2

__all__ = ["audit_api", "live_api", "signer"]
pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[2]


def test_forward_migration_backfills_atomic_jobs_without_rewriting_retained_data(
    request: pytest.FixtureRequest, tmp_path: Path
) -> None:
    assert disposable_database_selected(), (
        "Forward recovery rehearsal requires disposable selection"
    )
    assert (
        admin_sql("SELECT to_regclass('fieldmaps_private.account_deletions') IS NULL;")
        == "t"
    )
    api = cast("LiveApi", request.getfixturevalue("audit_api"))
    history = seed_history(api)
    user = api.tenant.users["observer"]
    forget(
        user
    )  # Old function creates only the tombstone in this authentic old schema.
    before = history.frozen()
    memberships = admin_sql(
        "SELECT row_to_json(m) FROM fieldmaps.project_memberships m "
        "WHERE project_id=:'project' ORDER BY user_id;",
        f"project={api.tenant.project}",
    )
    profile = admin_sql(
        "SELECT row_to_json(p) FROM fieldmaps.profiles p WHERE user_id=:'user';",
        f"user={user}",
    )
    grants = admin_sql(
        "SELECT table_name,column_name,grantee,privilege_type "
        "FROM information_schema.column_privileges "
        "WHERE table_schema='fieldmaps' ORDER BY 1,2,3,4;"
    )
    migration = next(
        (ROOT / "supabase/migrations").glob("*_account_deletion_recovery.sql")
    )
    admin_sql("BEGIN; " + migration.read_text() + " COMMIT;")
    assert state(user) == "0::false:false"
    assert history.frozen() == before
    assert (
        admin_sql(
            "SELECT row_to_json(p) FROM fieldmaps.profiles p WHERE user_id=:'user';",
            f"user={user}",
        )
        == profile
    )
    assert (
        admin_sql(
            "SELECT row_to_json(m) FROM fieldmaps.project_memberships m "
            "WHERE project_id=:'project' ORDER BY user_id;",
            f"project={api.tenant.project}",
        )
        == memberships
    )
    assert (
        admin_sql(
            "SELECT table_name,column_name,grantee,privilege_type "
            "FROM information_schema.column_privileges "
            "WHERE table_schema='fieldmaps' ORDER BY 1,2,3,4;"
        )
        == grants
    )
    (tmp_path / "retained-before.json").write_text(before + "\n")
    (tmp_path / "retained-after.json").write_text(history.frozen() + "\n")
    (tmp_path / "migration.sql").write_text(migration.read_text())
    # New old-runtime forget_user calls now enqueue too: the trigger closes the window.
    other = uuid4()
    admin_sql("INSERT INTO auth.users(id) VALUES (:'user');", f"user={other}")
    try:
        forget(other)
        assert state(other) == "0::false:false"
        with application(
            api.signer,
            lambda _request: httpx2.Response(404, json={"code": "user_not_found"}),
        ):
            eventually(lambda: state(user) == "" and state(other) == "")
        assert history.frozen() == before
        assert (
            admin_sql(
                "SELECT deleted_at IS NOT NULL FROM fieldmaps.profiles WHERE user_id=:'user';",
                f"user={user}",
            )
            == "t"
        )
    finally:
        admin_sql("DELETE FROM auth.users WHERE id=:'user';", f"user={other}")
