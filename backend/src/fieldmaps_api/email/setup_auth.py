"""Review/apply hosted Supabase SMTP settings without printing any credentials."""

# ruff: noqa: T201 - command-line status, never credentials or configuration payloads.

import argparse
import os
import re
from pathlib import Path

import httpx2
from pydantic import BaseModel, JsonValue

from fieldmaps_api.email.generate import generate
from fieldmaps_api.email.templates import AUTH_CONTENT, SECURITY_NOTIFICATIONS


class Arguments(BaseModel):
    project_ref: str
    apply: bool = False


def configuration() -> dict[str, JsonValue]:
    generate(check=True)
    required = (
        "BREVO_SMTP_SERVER",
        "BREVO_SMTP_PORT",
        "BREVO_SMTP_LOGIN",
        "BREVO_SMTP_API_KEY",
        "BREVO_SENDER_EMAIL",
        "BREVO_SENDER_NAME",
    )
    if any(not os.environ.get(name) for name in required):
        msg = "Configure all Brevo SMTP environment variables before setup"
        raise ValueError(msg)
    result: dict[str, JsonValue] = {
        "smtp_host": os.environ["BREVO_SMTP_SERVER"],
        "smtp_port": os.environ["BREVO_SMTP_PORT"],
        "smtp_user": os.environ["BREVO_SMTP_LOGIN"],
        "smtp_pass": os.environ["BREVO_SMTP_API_KEY"],
        "smtp_admin_email": os.environ["BREVO_SENDER_EMAIL"],
        "smtp_sender_name": os.environ["BREVO_SENDER_NAME"],
        "smtp_max_frequency": 60,
        "mailer_otp_length": 6,
        "mailer_otp_exp": 3600,
        "mailer_autoconfirm": False,
        "mailer_secure_email_change_enabled": True,
    }
    root = Path(__file__).resolve().parents[4]
    for name, content in AUTH_CONTENT.items():
        result[f"mailer_subjects_{name}"] = content.subject
        result[f"mailer_templates_{name}_content"] = (
            root / f"supabase/templates/{name}.html"
        ).read_text()
    for name in SECURITY_NOTIFICATIONS:
        result[f"mailer_notifications_{name}_enabled"] = True
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--apply", action="store_true")
    args = Arguments.model_validate(vars(parser.parse_args()))
    if re.fullmatch(r"[a-z]{20}", args.project_ref) is None:
        msg = "Use the 20-letter Supabase project reference"
        raise ValueError(msg)
    payload = configuration()
    print(
        f"SMTP setup for {args.project_ref}: {len(AUTH_CONTENT)} Contour templates, "
        "six-digit codes, security notifications."
    )
    if not args.apply:
        print("Review only. Add --apply to update this hosted project's Auth configuration.")
        return
    key = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
    if not key:
        msg = "Applying hosted Auth configuration requires SUPABASE_ACCESS_TOKEN"
        raise ValueError(msg)
    with httpx2.Client(timeout=20, follow_redirects=False) as client:
        response = client.patch(
            f"https://api.supabase.com/v1/projects/{args.project_ref}/config/auth",
            headers={"Authorization": f"Bearer {key}"},
            json=payload,
        )
    if not response.is_success:
        msg = f"Hosted Auth setup failed (HTTP {response.status_code}); no response body logged"
        raise RuntimeError(msg)
    print("Hosted Auth SMTP configuration updated. Verify signup and recovery on both apps.")


if __name__ == "__main__":
    main()
