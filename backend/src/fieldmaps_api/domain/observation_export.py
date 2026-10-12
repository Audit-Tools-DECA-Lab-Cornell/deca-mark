"""Complete self-contained export assets; all CSV cells receive formula protection."""

import csv
from collections.abc import Sequence
from io import BytesIO, StringIO
from typing import Final, assert_never
from zipfile import ZIP_DEFLATED, ZipFile

import orjson
from pydantic import JsonValue

from fieldmaps_api.domain.observation_export_columns import RECORD_COLUMNS
from fieldmaps_api.domain.observation_export_plan import answer_cells, plan
from fieldmaps_api.errors import DomainError
from fieldmaps_api.observation_analysis_schemas import (
    ExportSnapshot,
    HistoricalObservation,
    ObservationExportQuery,
)

ROW_LIMIT: Final = 10_000
BYTE_LIMIT: Final = 32 * 1024 * 1024
SOURCE_BYTE_LIMIT: Final = 64 * 1024 * 1024
TIME_LIMIT: Final = 10


def too_large() -> DomainError:
    return DomainError(
        "validation_failed",
        "Narrow the export scope and retry",
        422,
        {
            "issues": [
                {
                    "code": "export_scope_too_large",
                    "zone_ids": [],
                    "path": "",
                    "message": "Narrow the export scope and retry",
                }
            ]
        },
    )


def cell(value: JsonValue) -> str:
    match value:
        case None:
            return "n/a"
        case bool():
            return "yes" if value else "no"
        case str():
            return value
        case int() | float():
            return str(value)
        case list():
            return ";".join(cell(entry) for entry in value)
        case dict():
            return orjson.dumps(value).decode()
        case _:
            assert_never(value)


def csv_value(value: JsonValue) -> str | int | float:
    match value:
        case bool():
            return cell(value)
        case int() | float():
            return value
        case None | str() | list() | dict():
            return cell(value)
        case _:
            assert_never(value)


def csv_bytes(lines: Sequence[Sequence[str | int | float]]) -> bytes:
    output = StringIO(newline="")
    writer = csv.writer(output, lineterminator="\r\n")
    for line in lines:
        protected: list[str | int | float] = []
        for value in line:
            match value:
                case str():
                    protected.append(
                        "'" + value
                        if value.lstrip().startswith(("=", "+", "-", "@"))
                        or value.startswith(("\t", "\r", "\n"))
                        else value
                    )
                case int() | float():
                    protected.append(value)
                case _:
                    assert_never(value)
        writer.writerow(protected)
    return output.getvalue().encode("utf-8-sig")


def record(row: HistoricalObservation) -> dict[str, JsonValue]:
    values = row.model_dump(mode="json", exclude={"definition", "historical_geometry", "answers"})
    values["label"] = f"OBS-{str(row.observation_id)[:6]}"
    values["zone"] = row.zone_code
    values["zone_label_at_capture"] = values.pop("zone_label")
    values["map_version"] = values.pop("package_version")
    values["longitude"] = None if row.geometry is None else row.geometry.coordinates[0]
    values["latitude"] = None if row.geometry is None else row.geometry.coordinates[1]
    values["display_anchor_longitude"] = (
        None if row.display_anchor is None else row.display_anchor.coordinates[0]
    )
    values["display_anchor_latitude"] = (
        None if row.display_anchor is None else row.display_anchor.coordinates[1]
    )
    inventory = row.round_type == "inventory"
    values["Rel_Round"] = (
        None
        if inventory
        else ("yes" if row.round_type == "reliability" else "no")
    )
    values["First_Round"] = (
        None if inventory else ("yes" if row.first_round else "no")
    )
    return values


def assets(
    snapshot: ExportSnapshot, filters: ObservationExportQuery, project_id: str
) -> dict[str, bytes]:
    rows = snapshot.items
    planned = plan(rows, snapshot.forms)
    codebook = [["export_column", "source", "label", "type", "values"]]
    codebook.extend([[column, "record", column, "record value", ""] for column in RECORD_COLUMNS])
    codebook.extend(
        [
            [
                column.header,
                f"question {column.question_id} ({', '.join(column.versions)})"
                + ("" if column.option_set is None else f"; option set {column.option_set}"),
                column.label,
                column.kind,
                column.values,
            ]
            for column in planned.codebook
        ]
    )
    files = {"codebook.csv": csv_bytes(codebook)}
    records = [record(row) for row in rows]
    answers = [answer_cells(planned, row) for row in rows]
    match filters.format:
        case "csv":
            lines: list[list[str | int | float]] = [
                [*RECORD_COLUMNS, *(column.header for column in planned.columns)]
            ]
            for values, cells in zip(records, answers, strict=True):
                lines.append(
                    [
                        "" if values.get(key) is None else csv_value(values[key])
                        for key in RECORD_COLUMNS
                    ]
                    + [
                        csv_value(cells[column.header]) if column.header in cells else ""
                        for column in planned.columns
                    ]
                )
            files["observations.csv"] = csv_bytes(lines)
        case "geojson":
            features: list[JsonValue] = []
            for row, values, cells in zip(rows, records, answers, strict=True):
                geometry: JsonValue = None
                if row.geometry is not None:
                    geometry = {
                        "type": "Point",
                        "coordinates": [row.geometry.coordinates[0], row.geometry.coordinates[1]],
                    }
                properties: dict[str, JsonValue] = values | cells
                properties["answers"] = row.answers
                feature: JsonValue = {
                    "type": "Feature",
                    "id": str(row.observation_id),
                    "geometry": geometry,
                    "properties": properties,
                }
                features.append(feature)
            files["observations.geojson"] = orjson.dumps(
                {"type": "FeatureCollection", "features": features}
            )
        case _:
            assert_never(filters.format)
    historical: dict[str, JsonValue] = {}
    for row in rows:
        key = f"{row.package_id}:{row.zone_id}"
        if key in historical:
            continue
        historical[key] = {
            "type": "Feature",
            "id": key,
            "geometry": snapshot.historical_zones[key],
            "properties": {
                "package_id": str(row.package_id),
                "map_version": row.package_version,
                "zone_id": str(row.zone_id),
                "zone_code": row.zone_code,
                "zone_label_at_capture": row.zone_label,
            },
        }
    files["historical-zones.geojson"] = orjson.dumps(
        {"type": "FeatureCollection", "features": list(historical.values())}
    )
    files["forms.json"] = orjson.dumps(snapshot.forms)
    files["metadata.json"] = orjson.dumps(
        {
            "project_id": project_id,
            "total_matching": snapshot.total_matching,
            "generated_at": snapshot.generated_at.isoformat(),
            "project_timezone": snapshot.timezone,
            "timezone_interpretation": (
                "Filter timestamps are aware UTC instants; observed_from inclusive, "
                "observed_before exclusive"
            ),
            "filters": filters.model_dump(mode="json", exclude={"format"}),
            "versions": sorted({row.package_version for row in snapshot.items}),
            "limits": {
                "rows": ROW_LIMIT,
                "uncompressed_bytes": BYTE_LIMIT,
                "zip_bytes": BYTE_LIMIT,
                "seconds": TIME_LIMIT,
                "source_snapshot_bytes": SOURCE_BYTE_LIMIT,
            },
            "csv_missing_answer": "empty cell",
            "csv_null_answer": "n/a",
            "csv_multi_select": "semicolon-separated option codes",
            "display_anchor": (
                "Snapshot anchors are display aids; inventories have null event geometry"
            ),
        }
    )
    return files


def bundle(snapshot: ExportSnapshot, filters: ObservationExportQuery, project_id: str) -> bytes:
    if snapshot.total_matching > ROW_LIMIT or snapshot.source_bytes > SOURCE_BYTE_LIMIT:
        raise too_large()
    files = assets(snapshot, filters, project_id)
    if sum(len(value) for value in files.values()) > BYTE_LIMIT:
        raise too_large()
    output = BytesIO()
    with ZipFile(output, "w", compression=ZIP_DEFLATED) as archive:
        for name, data in files.items():
            archive.writestr(name, data)
    result = output.getvalue()
    if len(result) > BYTE_LIMIT:
        raise too_large()
    return result
