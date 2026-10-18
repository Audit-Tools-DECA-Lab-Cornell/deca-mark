"""Assess the commit/provider crash boundary without contacting Auth."""

from pathlib import Path
from typing import TYPE_CHECKING, cast
from unittest.mock import patch

import httpx2
import pytest
from fastapi.testclient import TestClient
from pydantic import HttpUrl

from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.main import create_app
from tests.local_database import admin_sql, database_settings, disposable_database_selected
from tests.signing import ISSUER, Signer
from tests.test_account_deletion import deletion_client, deletion_user

if TYPE_CHECKING:
    from uuid import UUID

__all__ = ["deletion_client", "deletion_user"]
pytestmark = pytest.mark.integration


def test_crash_after_forgetting_leaves_marker_until_an_explicit_retry(
    request: pytest.FixtureRequest, signer: Signer
) -> None:
    assert disposable_database_selected(), "Recovery assessment requires disposable selection"
    client = cast("TestClient", request.getfixturevalue("deletion_client"))
    user = cast("UUID", request.getfixturevalue("deletion_user"))
    with (
        patch(
            "fieldmaps_api.routers.identity.delete_auth_user",
            side_effect=RuntimeError("Synthetic crash after commit"),
        ) as provider,
        patch("fieldmaps_api.services.account_deletion.LOGGER.error") as pending_log,
        pytest.raises(RuntimeError, match="Synthetic crash after commit"),
    ):
        client.delete("/v1/me")
    provider.assert_called_once()
    pending_log.assert_not_called()
    candidates = admin_sql(
        "SELECT user_id FROM fieldmaps.profiles WHERE deleted_at IS NOT NULL AND user_id=:'user';",
        f"user={user}",
    )
    assert candidates == str(user)
    assert admin_sql("SELECT count(*) FROM auth.users WHERE id=:'user';", f"user={user}") == "1"
    assert (
        admin_sql(
            "SELECT count(*) FROM fieldmaps.project_memberships WHERE user_id=:'user';",
            f"user={user}",
        )
        == "0"
    )
    marker = admin_sql(
        "SELECT deleted_at FROM fieldmaps.profiles WHERE user_id=:'user';", f"user={user}"
    )
    settings = database_settings().model_copy(
        update={
            "issuer": HttpUrl(ISSUER),
            "jwks_url": HttpUrl(f"{ISSUER}/.well-known/jwks.json"),
            "auth_admin_key_file": Path("/synthetic-never-read"),
        }
    )
    # A new application instance sees the durable marker; startup does not finish deletion.
    with TestClient(
        create_app(settings, JwksVerifier(ISSUER, "authenticated", signer))
    ) as restarted:
        restarted.headers["Authorization"] = f"Bearer {signer.issue(user)}"
        with patch(
            "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport"
        ) as transport:
            assert restarted.get("/v1/me").status_code == 403
            transport.assert_not_called()
        assert (
            admin_sql(
                "SELECT deleted_at FROM fieldmaps.profiles WHERE user_id=:'user';", f"user={user}"
            )
            == marker
        )
        with (
            patch("anyio.Path.read_text", return_value="sb_secret_synthetic-test-value"),
            patch(
                "fieldmaps_api.services.account_deletion.httpx2.AsyncHTTPTransport",
                return_value=httpx2.MockTransport(lambda _request: httpx2.Response(404)),
            ),
        ):
            assert restarted.delete("/v1/me").status_code == 204
    # Model only the database-side cascade that a real Auth deletion would commit.
    # A mocked 404 above does not delete an Auth row in this synthetic database itself.
    admin_sql("DELETE FROM auth.users WHERE id=:'user';", f"user={user}")
    assert (
        admin_sql("SELECT count(*) FROM fieldmaps.profiles WHERE user_id=:'user';", f"user={user}")
        == "0"
    )
