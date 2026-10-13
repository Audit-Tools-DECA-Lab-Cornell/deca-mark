"""Generate checked-in SMTP templates and runtime tokens from the shared contract."""

import argparse
from pathlib import Path

from pydantic import BaseModel

from fieldmaps_api.email.templates import AUTH_CONTENT, contour, render


class Arguments(BaseModel):
    check: bool = False


def generate(*, check: bool = False) -> None:
    root = Path(__file__).resolve().parents[4]
    token_target = Path(__file__).with_name("contour.json")
    expected = (root / "contracts/contour.json").read_bytes()
    if check:
        if token_target.read_bytes() != expected:
            msg = "Email Contour tokens have drifted; run python -m fieldmaps_api.email.generate"
            raise ValueError(msg)
    else:
        token_target.write_bytes(expected)
    contour.cache_clear()
    for name, content in AUTH_CONTENT.items():
        target = root / "supabase/templates" / f"{name}.html"
        html = render(content).html.replace("https://placeholder.invalid", "{{ .ConfirmationURL }}")
        if check:
            if not target.exists() or target.read_text() != html:
                msg = f"Generated email template drift: {target.name}"
                raise ValueError(msg)
        else:
            target.write_text(html)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    generate(check=Arguments.model_validate(vars(parser.parse_args())).check)
