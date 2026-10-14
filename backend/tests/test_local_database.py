from pathlib import Path

import pytest

from tests import local_database


def test_all_local_clients_use_the_configured_runtime_password(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    credential = tmp_path / "synthetic-password"
    credential.write_text("synthetic-local-only\n")
    monkeypatch.delenv("DECAMARK_TEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("DECAMARK_TEST_DATABASE_CONTAINER", raising=False)
    monkeypatch.setattr(local_database, "password_file", lambda: credential)
    settings = local_database.database_settings()
    assert settings.database_password_file == credential
    assert local_database.connection_url().password == "synthetic-local-only"  # noqa: S105 - synthetic test credential.


def test_disposable_clients_keep_their_isolated_passwordless_connection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    url = "postgresql+asyncpg://fieldmaps_api@127.0.0.1:54329/postgres"
    monkeypatch.setenv("DECAMARK_TEST_DATABASE_URL", url)
    monkeypatch.setenv("DECAMARK_TEST_DATABASE_CONTAINER", "fieldmaps-zone-api-1234")
    assert local_database.database_settings().database_password_file is None
    assert str(local_database.connection_url()) == url
