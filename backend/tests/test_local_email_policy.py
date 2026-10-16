from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncEngine

from fieldmaps_api.config import Settings
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.main import create_app, create_app_from_config


@pytest.mark.parametrize("config", ["config.local.json", "config.auth-local.json"])
@pytest.mark.parametrize("enabled", [None, "true", "typo"])
@pytest.mark.parametrize("factory", [True, False])
def test_local_config_refuses_delivery_with_provider_settings(
    monkeypatch: pytest.MonkeyPatch, config: str, enabled: str | None, *, factory: bool
) -> None:
    # Given an actual local config with synthetic provider settings inherited by the process.
    config_settings = Settings.model_validate_json(
        (Path(__file__).resolve().parents[1] / config).read_bytes()
    ).model_copy(update={"database_password_file": None})
    monkeypatch.setattr("fieldmaps_api.main.read_local_settings", lambda: config_settings)
    monkeypatch.setenv("BREVO_API_KEY", "synthetic-provider-key")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "sender@example.test")
    if enabled is None:
        monkeypatch.delenv("EMAIL_ENABLED", raising=False)
    else:
        monkeypatch.setenv("EMAIL_ENABLED", enabled)

    async def disabled_delivery(_engine: AsyncEngine, settings: EmailSettings) -> None:
        assert not settings.enabled, "Local API must not start the email worker"

    monkeypatch.setattr("fieldmaps_api.main.assert_email_configured", disabled_delivery)
    # When the production config factory is invoked, inspect its email policy through startup.
    application = (
        create_app_from_config()
        if factory
        else create_app(
            config_settings,
            email_settings=EmailSettings(
                api_key=SecretStr("synthetic-provider-key"),
                sender_email="sender@example.test",
                enabled=True,
            ),
        )
    )
    # Then liveness works without touching the email outbox or starting a provider worker.
    with TestClient(application) as client:
        assert client.get("/health").status_code == 200
