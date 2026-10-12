"""Write synthetic previews of the real renderer to the ignored output folder."""

from dataclasses import replace
from pathlib import Path

from fieldmaps_api.email.templates import AUTH_CONTENT, EmailContent, render


def main() -> None:
    output = Path(__file__).resolve().parents[4] / "outputs/email"
    output.mkdir(parents=True, exist_ok=True)
    examples = {
        "verification": replace(AUTH_CONTENT["confirmation"], code="482 916"),
        "recovery": replace(AUTH_CONTENT["recovery"], code="761 024"),
        "invitation": EmailContent(
            "You are invited to Play Study · DECA Mark",
            "Join Play Study",
            (
                "You have been invited to join Play Study as an observer.",
                "Open the invitation or enter this join code in the DECA Mark mobile app.",
            ),
            code="DECA2026",
            action="Open invitation",
            url="https://example.test/invite",
            footnote="If you were not expecting this invitation, you can ignore it.",
        ),
        "reminder": EmailContent(
            "DECA Mark · Play Study: Prepare for collection",
            "Prepare for collection",
            ("Download the current map package before heading to the site.",),
            action="Open project",
            url="https://example.test/project",
            footnote="A reminder from your Play Study project team.",
        ),
        "security": AUTH_CONTENT["password_changed_notification"],
    }
    for name, content in examples.items():
        for theme in ("day", "dusk"):
            (output / f"{name}-{theme}.html").write_text(render(content, theme).html)


if __name__ == "__main__":
    main()
