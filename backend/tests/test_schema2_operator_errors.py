import json
import sys
from uuid import UUID

import pytest
from pydantic import JsonValue

from fieldmaps_api import form_schema_upgrade
from fieldmaps_api.form_schema_preflight import PreflightRow


@pytest.mark.parametrize(
    ("version", "definition", "expected"),
    [
        (2, {"questions": []}, "found schema version 2"),
        (
            1,
            {"fields": "invalid", "private_content": "DO_NOT_PRINT"},
            "invalid stored definition",
        ),
    ],
)
def test_local_preflight_refuses_with_actionable_error_without_contents_or_traceback(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
    version: int,
    definition: dict[str, JsonValue],
    expected: str,
) -> None:
    row = PreflightRow(
        id=UUID(int=1), schema_version=version, definition_text=json.dumps(definition)
    )

    def stored_rows(_container: str, _sql: str) -> str:
        return json.dumps([row.model_dump(mode="json")])

    monkeypatch.setattr(form_schema_upgrade, "psql", stored_rows)
    monkeypatch.setattr(sys, "argv", ["schema2", "preflight"])
    with pytest.raises(SystemExit) as stopped:
        form_schema_upgrade.main()
    output = capsys.readouterr()
    assert stopped.value.code == 2
    assert output.out == ""
    assert expected in output.err
    assert "Hosted Supabase was not changed" in output.err
    assert "DO_NOT_PRINT" not in output.err
    assert "Traceback" not in output.err
