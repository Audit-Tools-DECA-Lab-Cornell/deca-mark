"""Brevo v3 transactional API. No credentials, content, or recipients in errors."""

from http import HTTPStatus
from uuid import UUID

import httpx2
from pydantic import BaseModel, Field, ValidationError

from fieldmaps_api.email.config import EmailSettings
from fieldmaps_api.email.templates import RenderedEmail


class Receipt(BaseModel):
    message_id: str = Field(alias="messageId", min_length=1)


class Failure(BaseModel):
    code: str = ""


class ProviderError(Exception):
    def __init__(self, code: str, *, retryable: bool, retry_after: int = 0) -> None:
        super().__init__(code)
        self.code: str = code
        self.retryable: bool = retryable
        self.retry_after: int = retry_after


class Brevo:
    def __init__(self, settings: EmailSettings, client: httpx2.AsyncClient) -> None:
        self.settings: EmailSettings = settings
        self.client: httpx2.AsyncClient = client

    async def send(self, recipient: str, message: RenderedEmail, key: UUID) -> str:
        if not self.settings.enabled:
            code = "email_disabled"
            raise ProviderError(code, retryable=False)
        headers = {"idempotencyKey": str(key)}
        if self.settings.sandbox:
            headers["X-Sib-Sandbox"] = "drop"
        try:
            response = await self.client.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "api-key": self.settings.api_key.get_secret_value(),
                    "accept": "application/json",
                },
                json={
                    "sender": {
                        "email": self.settings.sender_email,
                        "name": self.settings.sender_name,
                    },
                    "to": [{"email": recipient}],
                    "subject": message.subject,
                    "htmlContent": message.html,
                    "textContent": message.text,
                    "headers": headers,
                    "tags": ["deca-mark", "transactional"],
                },
            )
        except httpx2.RequestError:
            code = "transport_unavailable"
            raise ProviderError(code, retryable=True) from None
        if response.is_success:
            try:
                return Receipt.model_validate_json(response.content).message_id
            except ValidationError:
                code = "invalid_provider_response"
                raise ProviderError(code, retryable=True) from None
        # Brevo rejects the repeated UUID inside its 30-minute idempotency window.
        if response.status_code == HTTPStatus.BAD_REQUEST:
            try:
                failure = Failure.model_validate_json(response.content)
            except ValidationError:
                failure = Failure()
            if failure.code == "duplicate_parameter":
                return f"deduplicated:{key}"
        delay = response.headers.get("retry-after", "0")
        code = f"brevo_http_{response.status_code}"
        raise ProviderError(
            code,
            retryable=response.status_code == HTTPStatus.TOO_MANY_REQUESTS
            or response.status_code >= HTTPStatus.INTERNAL_SERVER_ERROR,
            retry_after=min(int(delay), 900) if delay.isdecimal() else 0,
        )
