"""Provisional seed is a conservative, traceable subset of the workbook."""

import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from uuid import UUID

from pydantic import BaseModel, JsonValue, TypeAdapter

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.library_schemas import LibrarySettings, Section

ROOT = Path(__file__).resolve().parents[2]
JSON_ARRAY = TypeAdapter(list[dict[str, JsonValue]])


class SeedVariable(BaseModel):
    id: UUID
    code: str
    group: str
    section: Section
    cell: str
    settings: LibrarySettings


class HeldRow(BaseModel):
    cell: str
    code: str
    open_question: str


class Manifest(BaseModel):
    provisional: bool
    variables: list[SeedVariable]
    held_rows: list[HeldRow]


def test_provisional_seed_matches_workbook_and_sql() -> None:
    manifest = Manifest.model_validate_json((ROOT / "contracts/library/universal.json").read_text())
    assert manifest.provisional
    assert len(manifest.variables) == 10
    assert len(manifest.held_rows) == 97
    assert len({v.id for v in manifest.variables}) == 10
    seeded = {v.cell: v for v in manifest.variables}
    held = {v.cell: v for v in manifest.held_rows}
    assert not seeded.keys() & held.keys()
    for row in held.values():
        assert row.open_question
    ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(
        ROOT / "docs/variables/Behavior Mapping Variable Library_ Additional.xlsx"
    ) as z:
        strings = ["".join(x.itertext()) for x in ET.fromstring(z.read("xl/sharedStrings.xml"))]  # noqa: S314 - repository workbook
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))  # noqa: S314
        rows: dict[int, dict[str, str]] = {}
        for row in sheet.findall(".//s:row", ns):
            cells: dict[str, str] = {}
            for c in row:
                v = c.find("s:v", ns)
                if v is not None and v.text is not None:
                    address = c.attrib["r"]
                    cells[re.sub(r"\d", "", address)] = (
                        strings[int(v.text)] if c.get("t") == "s" else v.text
                    )
            rows[int(row.attrib["r"])] = cells
    variables = {f"B{r}": d["B"] for r, d in rows.items() if r > 3 and d.get("B")}
    assert set(seeded) | set(held) == set(variables) - {"B25", "B28"}
    for cell, var in seeded.items():
        row = int(cell[1:])
        assert var.code == variables[cell]
        assert var.settings.label == rows[row]["C"].strip()
        assert var.settings.export_column == rows[row]["E"].strip()
        assert var.settings.depends_on is None  # no rule invented for provisional content
        next_row = min((r for r in rows if r > row and rows[r].get("B")), default=10000)
        if var.settings.kind == "one":
            labels = [
                d["G"].strip()
                for r, d in rows.items()
                if row <= r < next_row and d.get("G", "").strip()
            ]
            assert [x.label for x in var.settings.options] == labels
        question = var.settings.model_dump(by_alias=True, exclude_none=True)
        FormDefinition.model_validate(
            {
                "version": "seed-check",
                "title": "Seed",
                "summary": "Seed",
                "source": "Seed",
                "status": "draft",
                "inclusion": "Seed",
                "questions": [
                    {
                        **question,
                        "id": var.settings.export_column,
                        "code": var.code,
                        "act": var.section,
                    }
                ],
            }
        )
    sql = (ROOT / "supabase/seed.sql").read_text().split("$library$")[1]
    rows_in_sql = JSON_ARRAY.validate_json(sql)
    assert len(rows_in_sql) == len(manifest.variables)
    assert rows_in_sql == [
        {
            "id": str(v.id),
            "code": v.code,
            "group_name": v.group,
            "section": v.section,
            "settings": v.settings.model_dump(mode="json", by_alias=True, exclude_unset=True),
        }
        for v in manifest.variables
    ]
