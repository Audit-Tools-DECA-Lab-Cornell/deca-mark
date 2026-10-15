"""Email security, provider protocol, and shared-template drift checks."""

import tomllib
from dataclasses import replace
from pathlib import Path
from uuid import UUID, uuid4

import anyio
import httpx2
import pytest
from pydantic import SecretStr, ValidationError

from fieldmaps_api.email.brevo import Brevo, ProviderError
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.email.generate import generate
from fieldmaps_api.email.setup_auth import configuration
from fieldmaps_api.email.templates import AUTH_CONTENT, EmailContent, render


def settings() -> EmailSettings:
    return EmailSettings(
        api_key=SecretStr("test-private-key"), sender_email="noreply@example.test", enabled=True
    )


@pytest.mark.parametrize(
    ("api_key", "sender", "enabled"),
    [
        ("", "", False),
        ("fake-key", "", False),
        ("", "sender@example.test", False),
        ("fake-key", "sender@example.test", True),
    ],
)
def test_provider_configuration_activates_delivery(
    monkeypatch: pytest.MonkeyPatch, api_key: str, sender: str, *, enabled: bool
) -> None:
    monkeypatch.delenv("EMAIL_ENABLED", raising=False)
    monkeypatch.setenv("BREVO_API_KEY", api_key)
    monkeypatch.setenv("BREVO_SENDER_EMAIL", sender)
    assert EmailSettings.from_environment().enabled is enabled


def test_explicit_email_disable_overrides_configured_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BREVO_API_KEY", "fake-key")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "sender@example.test")
    monkeypatch.setenv("EMAIL_ENABLED", "false")
    assert not EmailSettings.from_environment().enabled


def test_explicit_email_enable_requires_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BREVO_API_KEY", "")
    monkeypatch.setenv("BREVO_SENDER_EMAIL", "")
    monkeypatch.setenv("EMAIL_ENABLED", "true")
    with pytest.raises(ValidationError, match="Email delivery requires"):
        EmailSettings.from_environment()


@pytest.mark.parametrize("variable", ["EMAIL_ENABLED", "EMAIL_SANDBOX"])
def test_invalid_email_switch_fails_instead_of_silently_disabling_delivery(
    monkeypatch: pytest.MonkeyPatch, variable: str
) -> None:
    monkeypatch.setenv(variable, "typo")
    with pytest.raises(ValidationError, match=variable.removeprefix("EMAIL_").lower()):
        EmailSettings.from_environment()


def test_contour_generated_templates_match_contract() -> None:
    generate(check=True)
    root = Path(__file__).resolve().parents[2]
    for name in ("confirmation", "recovery", "reauthentication"):
        html = (root / f"supabase/templates/{name}.html").read_text()
        assert "{{ .Token }}" in html
        assert "ConfirmationURL" not in html
    assert "{{ .ConfirmationURL }}" in (root / "supabase/templates/email_change.html").read_text()
    # Local SMTP uses the same templates and notification settings as hosted setup.
    config = tomllib.loads((root / "supabase/config.toml").read_text())
    assert config["auth"]["email"]["otp_length"] == 6


@pytest.mark.parametrize("theme", ["day", "dusk"])
def test_email_content_is_escaped_and_plaintext_retains_meaning(theme: str) -> None:
    message = EmailContent(
        "Research & <review>",
        "<script>wrong</script>",
        ("<img src=x onerror=alert(1)>",),
        code="ABCD1234",
        action="Join",
        url="https://example.test/invite#t=safe",
    )
    result = render(message, "dusk" if theme == "dusk" else "day")
    assert "<script>" not in result.html
    assert "<img src=x" not in result.html
    assert "&lt;script&gt;" in result.html
    assert "ABCD1234" in result.text
    assert "https://example.test/invite#t=safe" in result.text


@pytest.mark.parametrize("url", ["javascript:alert(1)", "//evil.test", "http://evil.test"])
def test_unsafe_email_actions_are_rejected(url: str) -> None:
    with pytest.raises(ValueError, match="Email actions require"):
        render(replace(AUTH_CONTENT["invite"], url=url))


def test_brevo_request_uses_api_key_and_sandbox_inside_payload_headers() -> None:
    key = uuid4()

    def handler(request: httpx2.Request) -> httpx2.Response:
        assert str(request.url) == "https://api.brevo.com/v3/smtp/email"
        assert request.headers["api-key"] == "test-private-key"
        assert b'"X-Sib-Sandbox":"drop"' in request.content
        assert str(key).encode() in request.content
        assert b'"htmlContent"' in request.content
        assert b'"textContent"' in request.content
        return httpx2.Response(201, json={"messageId": "provider-message"})

    async def exercise() -> None:
        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
            provider = Brevo(settings().model_copy(update={"sandbox": True}), client)
            assert (
                await provider.send(
                    "observer@example.test", render(AUTH_CONTENT["confirmation"]), key
                )
                == "provider-message"
            )

    anyio.run(exercise)


@pytest.mark.parametrize(
    ("status", "retryable"), [(401, False), (400, False), (429, True), (503, True)]
)
def test_brevo_failures_are_classified_without_leaking_content(
    status: int, *, retryable: bool
) -> None:
    async def exercise() -> None:
        def handler(_request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(
                status, json={"message": "private address and token"}, headers={"Retry-After": "42"}
            )

        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
            with pytest.raises(ProviderError) as failure:
                await Brevo(settings(), client).send(
                    "observer@example.test", render(AUTH_CONTENT["confirmation"]), uuid4()
                )
            assert failure.value.retryable is retryable
            assert failure.value.retry_after == 42
            assert str(failure.value) == f"brevo_http_{status}"

    anyio.run(exercise)


def test_brevo_deduplicated_retry_is_a_success() -> None:
    async def exercise() -> None:
        def handler(_request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(400, json={"code": "duplicate_parameter"})

        async with httpx2.AsyncClient(transport=httpx2.MockTransport(handler)) as client:
            key = UUID("10000000-0000-4000-8000-000000000999")
            assert (
                await Brevo(settings(), client).send(
                    "observer@example.test", render(AUTH_CONTENT["confirmation"]), key
                )
                == f"deduplicated:{key}"
            )

    anyio.run(exercise)


def test_hosted_smtp_setup_maps_all_templates_and_security_notifications(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    values = {
        "BREVO_SMTP_SERVER": "smtp-relay.brevo.com",
        "BREVO_SMTP_PORT": "587",
        "BREVO_SMTP_LOGIN": "fake-login",
        "BREVO_SMTP_API_KEY": "fake-smtp-key",
        "BREVO_SENDER_EMAIL": "noreply@example.test",
        "BREVO_SENDER_NAME": "DECA Mark",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)
    result = configuration()
    assert result["smtp_pass"] == values["BREVO_SMTP_API_KEY"]
    assert result["mailer_otp_length"] == 6
    assert result["mailer_notifications_password_changed_enabled"] is True
    assert result["mailer_notifications_email_changed_enabled"] is True
    assert all(f"mailer_templates_{name}_content" in result for name in AUTH_CONTENT)
