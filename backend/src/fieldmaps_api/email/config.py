"""Server-only configuration; credentials are never part of public app settings."""

import os
from typing import ClassVar, Self

from pydantic import BaseModel, ConfigDict, HttpUrl, SecretStr, model_validator


class EmailSettings(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(frozen=True, extra="forbid")
    api_key: SecretStr = SecretStr("")
    sender_email: str = ""
    sender_name: str = "DECA Mark GIS"
    app_url: HttpUrl = HttpUrl("https://decamark.vercel.app")
    enabled: bool = False
    sandbox: bool = False

    @model_validator(mode="after")
    def validate_enabled(self) -> Self:
        if self.enabled and (not self.api_key.get_secret_value() or "@" not in self.sender_email):
            msg = "Email delivery requires BREVO_API_KEY and BREVO_SENDER_EMAIL"
            raise ValueError(msg)
        if self.app_url.scheme != "https" and self.app_url.host not in {"localhost", "127.0.0.1"}:
            msg = "EMAIL_APP_URL must use HTTPS outside loopback development"
            raise ValueError(msg)
        return self

    @classmethod
    def from_environment(cls) -> Self:
        return cls(
            api_key=SecretStr(os.environ.get("BREVO_API_KEY", "")),
            sender_email=os.environ.get("BREVO_SENDER_EMAIL", ""),
            sender_name=os.environ.get("BREVO_SENDER_NAME", "DECA Mark GIS"),
            app_url=HttpUrl(os.environ.get("EMAIL_APP_URL", "https://decamark.vercel.app")),
            enabled=os.environ.get("EMAIL_ENABLED", "false").lower() == "true",
            sandbox=os.environ.get("EMAIL_SANDBOX", "false").lower() == "true",
        )
