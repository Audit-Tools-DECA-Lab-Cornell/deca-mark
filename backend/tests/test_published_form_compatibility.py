"""Immutable published instruments are interpreted, never re-authored during export."""

import csv
import json
import shutil
import subprocess
import sys
from hashlib import sha256
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
import rfc8785
from pydantic import JsonValue, TypeAdapter, ValidationError

from fieldmaps_api.domain.forms import (
    FormDefinition,
    PublishedFormBoundsError,
    StoredFormDefinition,
    normalize_answers,
)
from fieldmaps_api.domain.observation_export_columns import questions
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.local_database import admin_sql
from tests.package_fixtures import submission
from tests.signing import ISSUER
from tests.tenant_fixtures import observation_payload
from tests.test_consolidated_audit import audit_api, instrument, live_api, reviewed_publication
from tests.test_observation_analysis_exports import files
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import document

__all__ = ["audit_api", "live_api"]
ROOT = Path(__file__).resolve().parents[2]
STORED = TypeAdapter[StoredFormDefinition](StoredFormDefinition)


def historical_definition(*, required: bool = False, hidden: bool = False) -> dict[str, JsonValue]:
    raw = instrument()
    authored = raw["questions"]
    assert isinstance(authored, list)
    assert isinstance(authored[0], dict)
    number = {**authored[0], "min": 10, "max": 1, "required": required}
    raw.update(version="past-v1", status="published")
    if hidden:
        number["dependsOn"] = {"kind": "answered", "question": "notes"}
        raw["questions"] = [authored[1], number, authored[2]]
    else:
        raw["questions"] = [number, authored[1], authored[2]]
    return raw


def test_stored_bounds_are_not_authoring_eligibility_or_answer_permission() -> None:
    for required, hidden in ((False, False), (True, False), (True, True)):
        raw = historical_definition(required=required, hidden=hidden)
        with pytest.raises(ValidationError, match="minimum greater"):
            FormDefinition.model_validate(raw)
        stored = STORED.validate_python(raw)
        assert questions(raw, 1)[0].id == ("notes" if hidden else "people")
        answers: dict[str, JsonValue] = {"round_type": 7}
        if not required or hidden:
            assert normalize_answers(stored, answers).answers == answers
        else:
            with pytest.raises(PublishedFormBoundsError, match="contact the project coordinator"):
                normalize_answers(stored, answers)
        for value in (-1, 0, 1, 5, 10, 11, 1.5, True, "", None):
            with pytest.raises(PublishedFormBoundsError):
                normalize_answers(stored, {**answers, "notes": "visible", "people": value})


@pytest.mark.parametrize(
    "patch",
    [
        {"id": "round_type"},
        {"min": True},
        {"max": None},
        {"min": 9007199254740992},
        {"dependsOn": {"kind": "answered", "question": "missing"}},
        {"dependsOn": {"kind": "answered", "question": "people"}},
        {"exportColumn": "notes"},
        {"kind": "unknown"},
    ],
)
def test_stored_reader_keeps_structural_safety(patch: dict[str, JsonValue]) -> None:
    raw = historical_definition()
    authored = raw["questions"]
    assert isinstance(authored, list)
    assert isinstance(authored[0], dict)
    raw["questions"] = [authored[0] | patch, *authored[1:]]
    with pytest.raises(ValidationError):
        STORED.validate_python(raw)
    with pytest.raises(ValidationError):
        questions(raw, 1)


@pytest.mark.integration
def test_published_history_exports_replays_and_retains_rejected_device_queue(  # noqa: PLR0915 - complete preservation path
    audit_api: LiveApi, tmp_path: Path
) -> None:
    api = audit_api
    project = f"/v1/projects/{api.tenant.project}"
    form, event = uuid4(), uuid4()
    raw = historical_definition()
    admin_sql(
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition) "
        "VALUES (:'form',:'org',:'project','past-v1',:'definition'::jsonb);",
        *api.tenant.variables(),
        f"form={form}",
        f"definition={json.dumps(raw)}",
    )
    with api.client() as manager:
        published = manager.post(
            f"{project}/packages",
            json=submission(site_id=str(api.tenant.site), form_version="past-v1"),
        )
        assert published.status_code == 201, published.text
        package = Publication.model_validate_json(published.content).package
        zones = manager.get(f"{project}/sites/{api.tenant.site}/zones")
        zone = HistoricalZones.model_validate_json(zones.content).zones[0].zone_id
        archive = manager.get(f"{project}/packages/{package.package_id}/archive").content
    body = {
        **observation_payload(api.tenant.site, package.package_id, zone),
        "form_version": "past-v1",
        "answers": {"notes": "", "round_type": 7},
    }
    digest = sha256(
        rfc8785.dumps(
            {
                "canonicalization_version": "observation-jcs-1",
                "project_id": str(api.tenant.project),
                "observation_id": str(event),
                "user_id": str(api.tenant.users["observer"]),
                "payload": {**body, "observed_at": "2026-09-17T12:00:00.000000Z"},
            }
        )
    ).hexdigest()
    admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; "
        "SELECT set_config('fieldmaps.user_id',:'observer',true); "
        "INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,"
        "observer_code,observed_at,geom,answers,created_by,upload_hash,package_id,zone_id,"
        "round_type,first_round,placement_source) "
        "VALUES (:'event',:'org',:'project',:'site',:'form','QA','2026-09-17T12:00:00Z',"
        "fieldmaps.make_point(-76.485,42.448),:'answers'::jsonb,:'observer',:'digest',"
        ":'package',:'zone','standard',true,'hand'); COMMIT;",
        *api.tenant.variables(),
        f"event={event}",
        f"form={form}",
        f"digest={digest}",
        f"package={package.package_id}",
        f"zone={zone}",
        f"answers={json.dumps(body['answers'])}",
    )
    frozen_query = (
        "SELECT jsonb_build_object('form',to_jsonb(f),'event',to_jsonb(o),"
        "'package',to_jsonb(p),'zones',(SELECT jsonb_agg(to_jsonb(z) ORDER BY zone_id) "
        "FROM fieldmaps.package_zones z WHERE package_id=p.id)) "
        "FROM fieldmaps.form_versions f,fieldmaps.observations o,fieldmaps.site_packages p "
        "WHERE f.id=:'form' AND o.id=:'event' AND p.id=:'package';"
    )
    variables = (f"form={form}", f"event={event}", f"package={package.package_id}")
    with api.client() as manager:
        successor = reviewed_publication(manager, project)
        replacement = manager.post(
            f"{project}/packages",
            json=submission(
                site_id=str(api.tenant.site),
                form_version=successor.code,
                expected_current_package_id=str(package.package_id),
                zone_identity_map=[
                    {"source_feature_id": "A", "zone_id": str(zone), "zone_code": "A"}
                ],
            ),
        )
        assert replacement.status_code == 201, replacement.text
        assert manager.post(f"{project}/form-versions/past-v1/retire").status_code == 200
    before = admin_sql(frozen_query, *variables)
    with api.client("observer") as observer:
        url = f"{project}/observations/{event}"
        receipt = observer.put(url, json=body)
        assert receipt.status_code == 200, receipt.text
        assert observer.put(url, json=body).content == receipt.content
        assert observer.put(url, json={**body, "answers": {"round_type": 7}}).status_code == 409
        fresh_id = uuid4()
        fresh = observer.put(f"{project}/observations/{fresh_id}", json=body)
        assert fresh.status_code == 200, fresh.text
        impossible = observer.put(
            f"{project}/observations/{uuid4()}",
            json={**body, "answers": {"people": 5, "round_type": 7}},
        )
        assert impossible.status_code == 422, impossible.text
        assert impossible.json()["error"]["details"]["issues"] == [
            {"code": "published_form_bounds"}
        ]
        assert observer.get(f"{project}/observations").status_code == 200
        assert observer.get(f"{project}/observations/export").status_code == 403
    with api.client("viewer") as viewer:
        detail = viewer.get(f"{project}/observations/{event}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["answers"] == body["answers"]
        assert detail.json()["definition"] == raw
        assert detail.json()["form_version"] == "past-v1"
        assert detail.json()["package_id"] == str(package.package_id)
        assert detail.json()["zone_id"] == str(zone)
        page = viewer.get(f"{project}/observations")
        assert page.status_code == 200, page.text
        items = document(page.content)["items"]
        assert isinstance(items, list)
        assert len(items) == 2
        for row in items:
            assert isinstance(row, dict)
            assert row["package_id"] == str(package.package_id)
            assert row["zone_id"] == str(zone)
            assert row["form_version"] == "past-v1"
            assert row["answers"] == (
                body["answers"] if row["observation_id"] == str(event) else {"round_type": 7}
            )
        for format_name in ("csv", "geojson"):
            response = viewer.get(f"{project}/observations/export", params={"format": format_name})
            assert response.status_code == 200, response.text
            assets = files(response.content)
            assert document(assets["forms.json"])["past-v1"] == raw
            codebook = list(csv.DictReader(StringIO(assets["codebook.csv"].decode("utf-8-sig"))))
            assert [(q["export_column"], q["label"], q["type"]) for q in codebook[-3:]] == [
                ("people", "People", "number"),
                ("notes", "Notes", "text"),
                ("answer_round_type", "Independent answer", "number"),
            ]
            if format_name == "csv":
                rows = list(
                    csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig")))
                )
                assert {
                    (r["people"], r["notes"], r["answer_round_type"], r["form_version"])
                    for r in rows
                } == {("", "", "7", "past-v1")}
            else:
                features = document(assets["observations.geojson"])["features"]
                assert isinstance(features, list)
                for feature in features:
                    assert isinstance(feature, dict)
                    props = feature["properties"]
                    assert isinstance(props, dict)
                    assert props["answers"] == (
                        body["answers"]
                        if props["observation_id"] == str(event)
                        else {"round_type": 7}
                    )
                    assert props["package_id"] == str(package.package_id)
                    assert props["zone_id"] == str(zone)
            (tmp_path / f"{format_name}.zip").write_bytes(response.content)
    conversion = subprocess.run(  # noqa: S603 - real converter, synthetic exported archives
        [
            sys.executable,
            str(ROOT / "qgis/zone-boundaries/prepare.py"),
            str(tmp_path / "geojson.zip"),
            str(tmp_path / "analysis"),
            "--csv-zip",
            str(tmp_path / "csv.zip"),
        ],
        env={},
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
    )
    assert conversion.returncode == 0, conversion.stdout + conversion.stderr
    assert (
        document((tmp_path / "analysis/projection-checks.json").read_bytes())["point_event_count"]
        == 2
    )
    assert admin_sql(frozen_query, *variables) == before
    with api.client() as manager:
        assert manager.get(f"{project}/packages/{package.package_id}/archive").content == archive
        assert manager.get(f"{project}/form-versions/past-v1").json()["definition"] == raw
    # Real transport -> existing rejection persistence -> SQLite restart -> explicit retry.
    fixture = {
        "scope": {
            "apiUrl": api.url,
            "issuer": ISSUER,
            "projectId": str(api.tenant.project),
            "userId": str(api.tenant.users["observer"]),
        },
        "token": api.signer.issue(api.tenant.users["observer"]),
        "siteId": str(api.tenant.site),
        "packageId": str(package.package_id),
        "zoneId": str(zone),
        "observationId": str(uuid4()),
        "packageSha256": package.archive_sha256,
    }
    node = shutil.which("node")
    assert node is not None
    result = subprocess.run(  # noqa: S603 - repository Vitest and synthetic loopback token
        [
            node,
            str(ROOT / "mobile/node_modules/vitest/vitest.mjs"),
            "run",
            "src/sync/published-form-outbox.test.ts",
        ],
        cwd=ROOT / "mobile",
        env={"PUBLISHED_FORM_API_FIXTURE": json.dumps(fixture)},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    print(result.stdout)  # noqa: T201 - test summary only, never fixture token
    with api.client("observer") as observer:
        assert observer.get(f"{project}/observations/{fixture['observationId']}").status_code == 404
    assert admin_sql(frozen_query, *variables) == before
    query = (
        (ROOT / "database/published-form-bounds-inventory.sql")
        .read_text()
        .strip()
        .removesuffix(";")
    )
    statement = f"BEGIN READ ONLY; SELECT row_to_json(i) FROM ({query}) i; ROLLBACK;"  # noqa: S608 - repository SQL
    inventory = document(admin_sql(statement).encode())
    assert inventory["form_version_id"] == str(form)
    assert inventory["definition"] == raw
    assert inventory["state"] == "retired"
    assert inventory["observations"] == 2
    assert inventory["observations_with_answer"] == 0
    bindings = inventory["package_bindings"]
    assert isinstance(bindings, list)
    assert isinstance(bindings[0], dict)
    assert bindings[0]["archive_sha256"] == sha256(archive).hexdigest()
    assert bindings[0]["current"] is False
    (tmp_path / "inventory.json").write_text(json.dumps(inventory, indent=2) + "\n")


@pytest.mark.integration
@pytest.mark.parametrize("hidden", [False, True], ids=["required-visible", "required-conditional"])
def test_required_inverted_bounds_never_accept_unsatisfiable_delayed_answers(
    audit_api: LiveApi, *, hidden: bool
) -> None:
    api = audit_api
    project = f"/v1/projects/{api.tenant.project}"
    form = uuid4()
    raw = historical_definition(required=True, hidden=hidden)
    admin_sql(
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition) "
        "VALUES (:'form',:'org',:'project','past-v1',:'definition'::jsonb);",
        *api.tenant.variables(),
        f"form={form}",
        f"definition={json.dumps(raw)}",
    )
    with api.client() as manager:
        response = manager.post(
            f"{project}/packages",
            json=submission(site_id=str(api.tenant.site), form_version="past-v1"),
        )
        assert response.status_code == 201, response.text
        package = Publication.model_validate_json(response.content).package.package_id
        zones = manager.get(f"{project}/sites/{api.tenant.site}/zones")
        zone = HistoricalZones.model_validate_json(zones.content).zones[0].zone_id
    base = {**observation_payload(api.tenant.site, package, zone), "form_version": "past-v1"}
    with api.client("observer") as observer:
        for answers, expected in (
            ({"round_type": 7}, 200 if hidden else 422),
            ({"round_type": 7, "notes": "visible"}, 422),
            ({"round_type": 7, "notes": "visible", "people": 5}, 422),
        ):
            event = uuid4()
            url = f"{project}/observations/{event}"
            response = observer.put(url, json={**base, "answers": answers})
            assert response.status_code == expected, response.text
            if expected == 422:
                assert response.json()["error"]["details"]["issues"] == [
                    {"code": "published_form_bounds"}
                ]
                assert observer.get(url).status_code == 404
            else:
                assert (
                    observer.put(url, json={**base, "answers": answers}).content == response.content
                )
    # Historical reads must preserve even an already stored answer that cannot pass
    # the instrument's constraints. This row is deliberately injected, not claimed
    # to be achievable through an old or current valid first upload.
    event = uuid4()
    admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; "
        "SELECT set_config('fieldmaps.user_id',:'observer',true); "
        "INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,"
        "observer_code,observed_at,geom,answers,created_by,upload_hash,package_id,zone_id,"
        "round_type,first_round,placement_source) "
        "VALUES (:'event',:'org',:'project',:'site',:'form','QA','2026-09-17T12:00:00Z',"
        "fieldmaps.make_point(-76.485,42.448),'{\"people\":5,\"round_type\":7}',:'observer',"
        "repeat('d',64),:'package',:'zone','standard',true,'hand'); COMMIT;",
        *api.tenant.variables(),
        f"event={event}",
        f"form={form}",
        f"package={package}",
        f"zone={zone}",
    )
    with api.client("viewer") as viewer:
        assert viewer.get(f"{project}/observations/{event}").json()["answers"] == {
            "people": 5,
            "round_type": 7,
        }
        for format_name in ("csv", "geojson"):
            response = viewer.get(f"{project}/observations/export", params={"format": format_name})
            assert response.status_code == 200, response.text
            assets = files(response.content)
            assert document(assets["forms.json"])["past-v1"] == raw
            if format_name == "csv":
                rows = csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig")))
                assert (
                    next(row for row in rows if row["observation_id"] == str(event))["people"]
                    == "5"
                )
            else:
                collection = document(assets["observations.geojson"])
                assert '"people":5' in json.dumps(collection, separators=(",", ":"))
