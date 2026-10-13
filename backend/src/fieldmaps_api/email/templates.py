"""Email-safe Contour layout shared by Supabase SMTP and application emails."""

# ruff: noqa: E501 - email HTML attributes remain together for client compatibility.

from dataclasses import dataclass
from functools import lru_cache
from html import escape
from importlib.resources import files
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel


class Palette(BaseModel):
    ground: str
    island: str
    well: str
    ledge: str
    line: str
    ink: str
    ink2: str
    accent: str
    onAccent: str  # noqa: N815 - canonical Contour token.


class Fonts(BaseModel):
    sans: str
    mono: str


class TypeStyle(BaseModel):
    size: int
    lineHeight: int  # noqa: N815 - canonical Contour token.
    weight: int
    tracking: float


class TypeScale(BaseModel):
    web: dict[str, TypeStyle]
    mobile: dict[str, TypeStyle]


class Theme(BaseModel):
    themes: dict[str, Palette]
    font: Fonts
    type: TypeScale
    radius: dict[str, dict[str, int]]
    size: dict[str, dict[str, int]]
    space: list[int]


@lru_cache(maxsize=1)
def contour() -> Theme:
    return Theme.model_validate_json(files(__package__).joinpath("contour.json").read_bytes())


@dataclass(frozen=True, slots=True)
class EmailContent:
    subject: str
    heading: str
    paragraphs: tuple[str, ...]
    kicker: str = "DECA MARK"
    code: str | None = None
    action: str | None = None
    url: str | None = None
    footnote: str = "This is a service email from DECA Mark."


@dataclass(frozen=True, slots=True)
class RenderedEmail:
    subject: str
    html: str
    text: str


def safe_url(url: str) -> str:
    parsed = urlsplit(url)
    if parsed.scheme not in {"https", "http"} or not parsed.hostname:
        msg = "Email actions require an absolute HTTP URL"
        raise ValueError(msg)
    if parsed.scheme == "http" and parsed.hostname not in {"localhost", "127.0.0.1"}:
        msg = "Email actions require HTTPS outside loopback development"
        raise ValueError(msg)
    return escape(url, quote=True)


def render(content: EmailContent, theme: Literal["day", "dusk"] = "day") -> RenderedEmail:
    tokens = contour()
    colors = tokens.themes[theme]
    styles = tokens.type.web
    body, heading, small, label = (styles[k] for k in ("body", "section", "small", "monoLabel"))
    code_style = tokens.type.mobile["monoCode"]
    padding = tokens.space[6]
    radius = tokens.radius["web"]["island"]
    sans = f"'{tokens.font.sans}',Arial,Helvetica,sans-serif"
    mono = f"'{tokens.font.mono}','Courier New',monospace"
    paragraphs = "".join(
        f'<p style="margin:0 0 {tokens.space[5]}px">{escape(p)}</p>' for p in content.paragraphs
    )
    code = (
        f'<div style="background:{colors.well};border-radius:{tokens.radius["web"]["input"]}px;'
        f"padding:{tokens.space[5]}px;margin-bottom:{tokens.space[5]}px;font-family:{mono};"
        f"font-size:{code_style.size}px;line-height:{code_style.lineHeight}px;"
        f'font-weight:{code_style.weight};letter-spacing:{code_style.tracking}em">{escape(content.code)}</div>'
        if content.code
        else ""
    )
    action = ""
    if content.action and content.url:
        action = (
            f'<table role="presentation" cellspacing="0" cellpadding="0"><tr><td bgcolor="{colors.accent}" '
            f'style="border-radius:{tokens.radius["web"]["pill"]}px">'
            f'<a href="{safe_url(content.url)}" style="display:inline-block;padding:{tokens.space[3]}px '
            f'{tokens.space[5]}px;color:{colors.onAccent};font-weight:{heading.weight};text-decoration:none">'
            f"{escape(content.action)}</a></td></tr></table>"
        )
    html = f"""<!doctype html>
<!-- Generated from contracts/contour.json. Do not edit generated templates. -->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="{"dark" if theme == "dusk" else "light"}"><title>{escape(content.subject)}</title></head>
<body style="margin:0;background:{colors.ground};color:{colors.ink};font-family:{sans};font-size:{body.size}px;line-height:{body.lineHeight}px">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">{escape(content.heading)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="{colors.ground}"><tr><td align="center" style="padding:{padding}px {tokens.space[3]}px">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px"><tr><td style="padding:0 {tokens.space[3]}px {tokens.space[5]}px;font-family:{mono};font-size:{label.size}px;letter-spacing:{label.tracking}em;font-weight:{label.weight}">{escape(content.kicker)}</td></tr>
<tr><td bgcolor="{colors.island}" style="padding:{padding}px;border:1px solid {colors.line};border-bottom:{tokens.size["web"]["ledge"]}px solid {colors.ledge};border-radius:{radius}px;overflow-wrap:anywhere">
<h1 style="margin:0 0 {tokens.space[5]}px;font-size:{heading.size}px;line-height:{heading.lineHeight}px;font-weight:{heading.weight};letter-spacing:{heading.tracking}em">{escape(content.heading)}</h1>
{paragraphs}{code}{action}
</td></tr><tr><td style="padding:{tokens.space[5]}px {tokens.space[3]}px;color:{colors.ink2};font-size:{small.size}px;line-height:{small.lineHeight}px">{escape(content.footnote)}<br>DECA Mark · Field research, together</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>"""
    text = "\n\n".join(
        (
            content.heading,
            *content.paragraphs,
            *([content.code] if content.code else []),
            *([f"{content.action}: {content.url}"] if content.action and content.url else []),
            content.footnote,
        )
    )
    return RenderedEmail(content.subject, html, text)


AUTH_CONTENT: dict[str, EmailContent] = {
    "confirmation": EmailContent(
        "Your DECA Mark verification code",
        "Verify your email",
        (
            "Enter this six-digit code in the DECA Mark web or mobile app to finish creating your account.",
        ),
        code="{{ .Token }}",
        footnote="If you did not create an account, you can ignore this email.",
    ),
    "recovery": EmailContent(
        "Your DECA Mark password reset code",
        "Reset your password",
        (
            "Enter this six-digit code in the DECA Mark web or mobile app, then choose a new password.",
        ),
        code="{{ .Token }}",
        footnote="If you did not request a password reset, you can ignore this email.",
    ),
    "magic_link": EmailContent(
        "Sign in to DECA Mark",
        "Your sign-in link",
        ("Use the link below to sign in to DECA Mark.",),
        action="Sign in",
        url="https://placeholder.invalid",
        footnote="If you did not request this, you can ignore this email.",
    ),
    "invite": EmailContent(
        "You are invited to DECA Mark",
        "Join DECA Mark",
        ("You have been invited to create a DECA Mark account.",),
        action="Accept invitation",
        url="https://placeholder.invalid",
    ),
    "email_change": EmailContent(
        "Confirm your DECA Mark email change",
        "Confirm your email change",
        ("Use the link below to confirm the requested change to your sign-in email address.",),
        action="Confirm email change",
        url="https://placeholder.invalid",
        footnote="If you did not request this change, contact your organization administrator.",
    ),
    "reauthentication": EmailContent(
        "Your DECA Mark security code",
        "Verify it is you",
        ("Enter this code in DECA Mark to continue with your account change.",),
        code="{{ .Token }}",
    ),
}

SECURITY_NOTIFICATIONS: dict[str, str] = {
    "password_changed": "Your password was changed",
    "email_changed": "Your sign-in email was changed",
    "phone_changed": "Your phone number was changed",
    "identity_linked": "A sign-in method was added",
    "identity_unlinked": "A sign-in method was removed",
    "mfa_factor_enrolled": "Two-step verification was added",
    "mfa_factor_unenrolled": "Two-step verification was removed",
}
for _kind, _heading in SECURITY_NOTIFICATIONS.items():
    AUTH_CONTENT[f"{_kind}_notification"] = EmailContent(
        f"DECA Mark: {_heading.lower()}",
        _heading,
        (
            "This account change has been completed. If you did not make it, contact your organization administrator and secure your account.",
        ),
        kicker="DECA MARK · ACCOUNT SECURITY",
    )
