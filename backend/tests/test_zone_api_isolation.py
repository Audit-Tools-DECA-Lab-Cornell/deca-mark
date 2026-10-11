import pytest

from tests.local_database import database_url, disposable_database_selected, password_file


@pytest.mark.parametrize("container", ["supabase_db_field-maps", "other-project-database"])
def test_disposable_overrides_cannot_select_a_persistent_database_container(
    monkeypatch: pytest.MonkeyPatch, container: str
) -> None:
    monkeypatch.setenv("DECAMARK_TEST_DATABASE_CONTAINER", container)
    monkeypatch.setenv(
        "DECAMARK_TEST_DATABASE_URL", "postgresql+asyncpg://fieldmaps_api@127.0.0.1:5432/postgres"
    )
    with pytest.raises(ValueError, match="rehearsal prefix"):
        disposable_database_selected()


@pytest.mark.parametrize(
    "provided", ["DECAMARK_TEST_DATABASE_URL", "DECAMARK_TEST_DATABASE_CONTAINER"]
)
def test_disposable_overrides_must_be_selected_together(
    monkeypatch: pytest.MonkeyPatch, provided: str
) -> None:
    monkeypatch.delenv("DECAMARK_TEST_DATABASE_URL", raising=False)
    monkeypatch.delenv("DECAMARK_TEST_DATABASE_CONTAINER", raising=False)
    monkeypatch.setenv(provided, "synthetic")
    with pytest.raises(ValueError, match="both disposable"):
        disposable_database_selected()


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+asyncpg://fieldmaps_api@remote.invalid:5432/postgres",
        "postgresql+asyncpg://fieldmaps_api@127.0.0.1:5432/postgres?host=remote.invalid",
    ],
)
def test_disposable_database_url_cannot_redirect_to_another_host(
    monkeypatch: pytest.MonkeyPatch, url: str
) -> None:
    monkeypatch.setenv("DECAMARK_TEST_DATABASE_CONTAINER", "fieldmaps-zone-api-1234")
    monkeypatch.setenv("DECAMARK_TEST_DATABASE_URL", url)
    with pytest.raises(ValueError, match="loopback"):
        database_url()


def test_disposable_database_does_not_select_local_credentials(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DECAMARK_TEST_DATABASE_CONTAINER", "fieldmaps-zone-api-1234")
    monkeypatch.setenv(
        "DECAMARK_TEST_DATABASE_URL", "postgresql+asyncpg://fieldmaps_api@127.0.0.1:5432/postgres"
    )
    assert password_file() is None
