"""The original audit crash boundary now recovers through real application startup."""

from unittest.mock import patch
from uuid import UUID

import httpx2
import pytest

from tests.local_database import admin_sql
from tests.signing import Signer
from tests.test_account_deletion import deletion_user
from tests.test_account_deletion_recovery import application, eventually, state, user

__all__ = ["deletion_user", "user"]
pytestmark = pytest.mark.integration


def test_commit_before_provider_interruption_recovers_on_real_startup(
    user: UUID, signer: Signer
) -> None:
    def unexpected(_request: httpx2.Request) -> httpx2.Response:
        pytest.fail("No provider call should precede the synthetic interruption")

    with application(signer, unexpected) as client:
        client.headers["Authorization"] = f"Bearer {signer.issue(user)}"
        with (
            patch(
                "fieldmaps_api.routers.identity.reconcile_one",
                side_effect=RuntimeError("Synthetic interruption after commit"),
            ),
            pytest.raises(RuntimeError, match="interruption after commit"),
        ):
            client.delete("/v1/me")
        assert state(user) == "0::false:false"
        assert client.get("/v1/me").status_code == 403
    with application(signer, lambda _request: httpx2.Response(204)):
        eventually(lambda: state(user) == "")
    # A completed retry cannot recreate memberships or clear the local tombstone.
    assert (
        admin_sql(
            "SELECT deleted_at IS NOT NULL AND display_name IS NULL AND "
            "observer_initials IS NULL AND locale IS NULL FROM fieldmaps.profiles "
            "WHERE user_id=:'user';",
            f"user={user}",
        )
        == "t"
    )
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.project_memberships WHERE user_id=:'user';",
            f"user={user}",
        )
        == "0"
    )
