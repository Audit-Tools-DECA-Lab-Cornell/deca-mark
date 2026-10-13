"""Check credentials/sender and submit a sandbox request; never sends an email."""

# ruff: noqa: T201 - command-line status, never credentials or provider response bodies.

from uuid import uuid4

import anyio
import httpx2
from pydantic import BaseModel

from fieldmaps_api.email.brevo import Brevo, ProviderError
from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.email.templates import EmailContent, render


class Sender(BaseModel):
    email: str
    active: bool


class Senders(BaseModel):
    senders: list[Sender]


async def main() -> None:
    settings = EmailSettings.from_environment().model_copy(
        update={"enabled": True, "sandbox": True}
    )
    if not settings.api_key.get_secret_value() or not settings.sender_email:
        msg = "Configure BREVO_API_KEY and BREVO_SENDER_EMAIL"
        raise ValueError(msg)
    async with httpx2.AsyncClient(timeout=15, follow_redirects=False) as client:
        response = await client.get(
            "https://api.brevo.com/v3/senders",
            headers={"api-key": settings.api_key.get_secret_value()},
        )
        if not response.is_success:
            print(f"Brevo authentication/sender check failed: HTTP {response.status_code}")
            raise SystemExit(1)
        senders = Senders.model_validate_json(response.content)
        if not any(s.email == settings.sender_email and s.active for s in senders.senders):
            print("The configured sender must be registered and verified in Brevo.")
            raise SystemExit(1)
        provider = Brevo(settings, client)
        try:
            await provider.send(
                settings.sender_email,
                render(
                    EmailContent(
                        "DECA Mark integration check",
                        "Delivery check",
                        ("Sandbox validation. No email is delivered.",),
                    )
                ),
                uuid4(),
            )
        except ProviderError as error:
            print(f"Brevo sandbox validation failed: {error.code}")
            raise SystemExit(1) from None
    print("Brevo sender and sandbox request verified; no email sent.")


if __name__ == "__main__":
    anyio.run(main)
