"""One signed, current-source path through the audit fixes and real GIS converter."""

import csv
import subprocess
import sys
from io import StringIO
from pathlib import Path
from typing import cast
from uuid import UUID, uuid4

import httpx2
import pytest
from pydantic import JsonValue

from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.observation_analysis_schemas import ObservationPage
from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.local_database import disposable_database_selected
from tests.package_fixtures import submission
from tests.tenant_fixtures import observation_payload
from tests.test_observation_analysis_exports import files
from tests.test_zone_api_live import LiveApi, live_api
from tests.zone_api_fixtures import document

__all__ = ["live_api"]
pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def audit_api(request: pytest.FixtureRequest) -> LiveApi:
    assert disposable_database_selected(), "Consolidated acceptance requires disposable selection"
    return cast("LiveApi", request.getfixturevalue("live_api"))


def instrument() -> dict[str, JsonValue]:
    return {
        "version": "synthetic-v1",
        "title": "Synthetic audit instrument",
        "summary": "Consolidated local acceptance",
        "source": "Authored synthetic case",
        "status": "draft",
        "inclusion": "Synthetic only",
        "questions": [
            {
                "id": "people",
                "code": "people",
                "exportColumn": "people",
                "act": "Social",
                "label": "People",
                "kind": "number",
                "required": True,
                "min": 0,
                "max": 999,
                "source": "Synthetic",
            },
            {
                "id": "notes",
                "code": "notes",
                "exportColumn": "notes",
                "act": "Record",
                "label": "Notes",
                "kind": "text",
                "maxLength": 1000,
                "source": "Synthetic",
            },
            {
                "id": "round_type",
                "code": "round_type",
                "exportColumn": "round_type",
                "act": "Record",
                "label": "Independent answer",
                "kind": "number",
                "required": True,
                "min": 7,
                "max": 7,
                "source": "Synthetic",
            },
        ],
    }


def reviewed_publication(manager: httpx2.Client, project: str) -> FormVersionDetail:
    created = manager.post(
        f"{project}/forms",
        json={
            "code": "audit",
            "name": "Synthetic audit",
            "definition": instrument(),
        },
    )
    assert created.status_code == 201, created.text
    first = FormVersionDetail.model_validate_json(created.content)
    url = f"{project}/form-versions/{first.code}"
    saved = manager.put(
        url,
        headers={"If-Match": first.etag},
        json={
            "definition": {**first.definition, "title": "Reviewed audit wording"},
        },
    )
    assert saved.status_code == 200, saved.text
    current = FormVersionDetail.model_validate_json(saved.content)
    for method, suffix, body in (
        ("PUT", "", {"definition": first.definition}),
        ("DELETE", "", None),
        ("POST", "/publish", None),
    ):
        for headers, expected in (({}, 428), ({"If-Match": first.etag}, 412)):
            refused = manager.request(method, url + suffix, headers=headers, json=body)
            assert refused.status_code == expected, refused.text
            read = manager.get(url)
            assert FormVersionDetail.model_validate_json(read.content) == current
    reviewed = manager.get(url)
    assert reviewed.headers["etag"] == current.etag
    published = manager.post(url + "/publish", headers={"If-Match": current.etag})
    assert published.status_code == 200, published.text
    frozen = FormVersionDetail.model_validate_json(published.content)
    assert frozen.state == "published"
    assert frozen.title == "Reviewed audit wording"
    assert frozen.revision == current.revision
    return frozen


def upload_and_review(
    api: LiveApi, project: str, package: UUID, zone: UUID, code: str
) -> tuple[UUID, UUID]:
    own, other = uuid4(), uuid4()
    body = {
        **observation_payload(api.tenant.site, package, zone),
        "form_version": code,
        "answers": {"people": 0, "notes": "Synthetic audit café", "round_type": 7},
    }
    with api.client("observer") as observer:
        url = f"{project}/observations/{own}"
        bad = observer.put(url, json={**body, "answers": {"people": -1, "round_type": 7}})
        assert bad.status_code == 422, bad.text
        assert observer.get(url).status_code == 404
        accepted = observer.put(url, json=body)
        assert accepted.status_code == 200, accepted.text
        # The first success was committed but its acknowledgement was lost locally.
        assert observer.put(url, json=body).content == accepted.content
        conflict = observer.put(url, json={**body, "answers": {"people": 1, "round_type": 7}})
        assert conflict.status_code == 409, conflict.text
        detail = document(observer.get(url).content)
        assert detail["round_type"] == "standard"
        assert detail["answers"] == body["answers"]
    with api.client() as manager:
        stored = manager.put(f"{project}/observations/{other}", json=body)
        assert stored.status_code == 200, stored.text
    with api.client("observer") as observer:
        assert observer.get(f"{project}/observations/{other}").status_code == 404
        page = observer.get(f"{project}/observations")
        assert page.status_code == 200, page.text
        assert {
            row.observation_id for row in ObservationPage.model_validate_json(page.content).items
        } == {own}
        for format_name in ("csv", "geojson"):
            denied = observer.get(f"{project}/observations/export", params={"format": format_name})
            assert denied.status_code == 403, denied.text
    return own, other


def export_and_prepare(api: LiveApi, project: str, output: Path, expected: set[UUID]) -> None:
    for role in ("viewer", "manager"):
        with api.client(role) as reader:
            for identifier in expected:
                assert reader.get(f"{project}/observations/{identifier}").status_code == 200
            for format_name in ("csv", "geojson"):
                response = reader.get(
                    f"{project}/observations/export", params={"format": format_name}
                )
                assert response.status_code == 200, response.text
                bundle = files(response.content)
                assert document(bundle["metadata.json"])["total_matching"] == 2
                if format_name == "csv":
                    rows = list(
                        csv.DictReader(StringIO(bundle["observations.csv"].decode("utf-8-sig")))
                    )
                    assert {UUID(row["observation_id"]) for row in rows} == expected
                    assert {(row["round_type"], row["answer_round_type"]) for row in rows} == {
                        ("standard", "7")
                    }
                else:
                    events = document(bundle["observations.geojson"])["features"]
                    assert isinstance(events, list)
                    for event in events:
                        assert isinstance(event, dict)
                        props = event["properties"]
                        assert isinstance(props, dict)
                        assert props["round_type"] == "standard"
                        assert props["answer_round_type"] == 7
                        assert isinstance(props["answers"], dict)
                        assert props["answers"]["round_type"] == 7
                if role == "viewer":
                    (output / f"{format_name}.zip").write_bytes(response.content)
    command = [
        sys.executable,
        str(ROOT / "qgis/zone-boundaries/prepare.py"),
        str(output / "geojson.zip"),
        str(output / "analysis"),
        "--csv-zip",
        str(output / "csv.zip"),
    ]
    conversion = subprocess.run(  # noqa: S603 - real repository CLI and local synthetic paths
        command,
        env={},
        capture_output=True,
        text=True,
        check=False,
        timeout=10,
    )
    assert conversion.returncode == 0, conversion.stdout + conversion.stderr
    checks = document((output / "analysis/projection-checks.json").read_bytes())
    assert checks["total_matching"] == checks["point_event_count"] == 2
    assert checks["inventory_record_count"] == 0
    assert checks["csv_geojson_scope_and_identity_agree"] is True


def test_canonical_review_package_upload_retry_authorization_export_qgis(
    audit_api: LiveApi, tmp_path: Path
) -> None:
    api = audit_api
    project = f"/v1/projects/{api.tenant.project}"
    with api.client() as manager:
        form = reviewed_publication(manager, project)
        created = manager.post(
            f"{project}/packages",
            json=submission(
                site_id=str(api.tenant.site),
                form_version=form.code,
            ),
        )
        assert created.status_code == 201, created.text
        package = Publication.model_validate_json(created.content).package.package_id
        zones = manager.get(
            f"{project}/sites/{api.tenant.site}/zones", params={"package_id": str(package)}
        )
        assert zones.status_code == 200, zones.text
        zone = HistoricalZones.model_validate_json(zones.content).zones[0].zone_id
    with api.client("observer") as observer:
        version = observer.get(f"{project}/form-versions/{form.code}")
        assert FormVersionDetail.model_validate_json(version.content).definition == form.definition
        archive = observer.get(f"{project}/packages/{package}/archive")
        assert archive.status_code == 200, archive.text
    own, other = upload_and_review(api, project, package, zone, form.code)
    export_and_prepare(api, project, tmp_path, {own, other})
