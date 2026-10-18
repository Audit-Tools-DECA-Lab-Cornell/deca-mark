"""Keep immutable old definitions readable while new authoring stays canonical."""

import csv
import json
import shutil
import subprocess
from hashlib import sha256
from io import StringIO
from pathlib import Path
from typing import TYPE_CHECKING, cast
from uuid import uuid4

import pytest

from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.zone_response_schemas import Publication
from tests.fields_only_fixtures import FIELDS_ONLY, FieldsHistory, seed_history
from tests.local_database import admin_sql, disposable_database_selected
from tests.package_fixtures import submission
from tests.signing import ISSUER
from tests.test_observation_analysis_exports import files
from tests.test_zone_api_live import live_api as live_api  # noqa: PLC0414 - shared pytest fixture
from tests.zone_api_fixtures import document

if TYPE_CHECKING:
    from tests.test_zone_api_live import LiveApi

pytestmark = pytest.mark.integration
ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def fields_history(request: pytest.FixtureRequest) -> FieldsHistory:
    # Refuse before requesting live_api: that fixture otherwise creates its tenant first.
    assert disposable_database_selected(), "Fields-only acceptance requires disposable selection"
    api = cast("LiveApi", request.getfixturevalue("live_api"))
    return seed_history(api)


@pytest.mark.parametrize("format_name", ["csv", "geojson"])
def test_fields_only_historical_read_and_export(
    fields_history: FieldsHistory, format_name: str
) -> None:
    history = fields_history
    before = history.frozen()
    with history.api.client("observer") as observer:
        detail = observer.get(f"{history.project}/observations/{history.observation}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["answers"] == {"people": 0, "notes": ""}
        assert detail.json()["package_id"] == str(history.package)
        assert detail.json()["zone_id"] == str(history.zone)
        replay = observer.put(
            f"{history.project}/observations/{history.observation}", json=history.body()
        )
        assert replay.status_code == 200, replay.text
    with history.api.client("viewer") as reader:
        version = reader.get(f"{history.project}/form-versions/historic-v1")
        assert version.status_code == 200, version.text
        assert version.json()["definition"] == FIELDS_ONLY
        exported = reader.get(
            f"{history.project}/observations/export", params={"format": format_name}
        )
        assert exported.status_code == 200, exported.text
        assets = files(exported.content)
        assert document(assets["forms.json"])["historic-v1"] == FIELDS_ONLY
        if format_name == "csv":
            row = next(csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig"))))
            assert (row["people"], row["notes"], row["form_version"]) == ("0", "", "historic-v1")
            assert (row["package_id"], row["zone_id"]) == (str(history.package), str(history.zone))
        else:
            features = document(assets["observations.geojson"])["features"]
            assert isinstance(features, list)
            assert len(features) == 1
            feature = features[0]
            assert isinstance(feature, dict)
            properties = feature["properties"]
            assert isinstance(properties, dict)
            assert properties["answers"] == {"people": 0, "notes": ""}
            assert properties["form_version"] == "historic-v1"
            assert (properties["package_id"], properties["zone_id"]) == (
                str(history.package),
                str(history.zone),
            )
        columns = list(csv.DictReader(StringIO(assets["codebook.csv"].decode("utf-8-sig"))))
        assert [(c["export_column"], c["label"], c["type"]) for c in columns[-2:]] == [
            ("people", "people", "integer"),
            ("notes", "notes", "text"),
        ]
    assert history.frozen() == before


def test_fields_only_queue_after_canonical_successor(fields_history: FieldsHistory) -> None:
    history = fields_history
    before = history.frozen()
    with history.api.client() as manager:
        # New authoring still rejects fields-only data. A successor needs an explicit instrument.
        invalid = manager.post(
            f"{history.project}/forms",
            json={"code": "bad", "name": "Bad", "definition": FIELDS_ONLY},
        )
        assert invalid.status_code == 422, invalid.text
        copy = manager.post(f"{history.project}/forms/historic/versions", json={})
        assert copy.status_code == 422, copy.text
        canonical = manager.get(f"{history.project}/form-versions/shell-v1")
        assert canonical.status_code == 200, canonical.text
        created = manager.post(
            f"{history.project}/forms/historic/versions",
            json={"definition": canonical.json()["definition"]},
        )
        assert created.status_code == 201, created.text
        successor = FormVersionDetail.model_validate_json(created.content)
        published = manager.post(
            f"{history.project}/form-versions/historic-v2/publish",
            headers={"If-Match": successor.etag},
        )
        assert published.status_code == 200, published.text
        package = manager.post(
            f"{history.project}/packages",
            json=submission(
                site_id=str(history.api.tenant.site),
                form_version="historic-v2",
                expected_current_package_id=str(history.package),
                zone_identity_map=[
                    {"source_feature_id": "A", "zone_id": str(history.zone), "zone_code": "A"}
                ],
            ),
        )
        assert package.status_code == 201, package.text
        current = Publication.model_validate_json(package.content).package.package_id
        retired = manager.post(f"{history.project}/form-versions/historic-v1/retire")
        assert retired.status_code == 200, retired.text
        archive = manager.get(f"{history.project}/packages/{history.package}/archive")
        assert archive.status_code == 200, archive.text
        assert archive.content == history.archive
    queued_id = uuid4()
    node = shutil.which("node")
    assert node is not None
    fixture = {
        "scope": {
            "apiUrl": history.api.url,
            "issuer": ISSUER,
            "userId": str(history.api.tenant.users["observer"]),
            "projectId": str(history.api.tenant.project),
        },
        "token": history.api.signer.issue(history.api.tenant.users["observer"]),
        "siteId": str(history.api.tenant.site),
        "packageId": str(history.package),
        "zoneId": str(history.zone),
        "formVersion": "historic-v1",
        "observationId": str(queued_id),
        "packageSha256": sha256(history.archive).hexdigest(),
    }
    result = subprocess.run(  # noqa: S603 - repository Vitest, argv only, synthetic loopback fixture
        [
            node,
            str(ROOT / "mobile/node_modules/vitest/vitest.mjs"),
            "run",
            "src/sync/fields-only-outbox.test.ts",
        ],
        cwd=ROOT / "mobile",
        env={"FIELDS_ONLY_API_FIXTURE": json.dumps(fixture)},
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    print(result.stdout)  # noqa: T201 - actual SQLite/HTTP acceptance evidence; no tokens
    with history.api.client("observer") as observer:
        replay = observer.put(
            f"{history.project}/observations/{history.observation}", json=history.body()
        )
        assert replay.status_code == 200, replay.text
        detail = observer.get(f"{history.project}/observations/{queued_id}")
        assert detail.status_code == 200, detail.text
        assert detail.json()["answers"] == {"people": 0, "notes": ""}
        assert detail.json()["form_version"] == "historic-v1"
        assert detail.json()["package_id"] == str(history.package)
        assert detail.json()["zone_id"] == str(history.zone)
        canonical_upload = observer.put(
            f"{history.project}/observations/{uuid4()}",
            json={
                **history.body(),
                "package_id": str(current),
                "form_version": "historic-v2",
                "answers": {"people": 999, "notes": "Canonical successor"},
            },
        )
        assert canonical_upload.status_code == 200, canonical_upload.text
    with history.api.client("viewer") as reader:
        for format_name in ("csv", "geojson"):
            exported = reader.get(
                f"{history.project}/observations/export", params={"format": format_name}
            )
            assert exported.status_code == 200, exported.text
            assets = files(exported.content)
            definitions = document(assets["forms.json"])
            assert definitions["historic-v1"] == FIELDS_ONLY
            assert isinstance(definitions["historic-v2"], dict)
            assert "questions" in definitions["historic-v2"]
            assert document(assets["metadata.json"])["total_matching"] == 3
    assert history.frozen() == before


def test_fields_only_fresh_bound_upload(fields_history: FieldsHistory) -> None:
    history = fields_history
    with history.api.client("observer") as observer:
        url = f"{history.project}/observations/{uuid4()}"
        body = history.body()
        accepted = observer.put(url, json=body)
        assert accepted.status_code == 200, accepted.text
        assert observer.put(url, json=body).content == accepted.content
        for answers in (
            {},
            {"people": -1},
            {"people": 1000},
            {"people": 1.5},
            {"people": 1, "notes": "x" * 1001},
            {"people": 1, "unknown": "x"},
        ):
            invalid = observer.put(
                f"{history.project}/observations/{uuid4()}", json={**body, "answers": answers}
            )
            assert invalid.status_code == 422, invalid.text
        assert observer.put(url, json={**body, "answers": {"people": 1}}).status_code == 409


def test_fields_only_inventory_counts_existing_references(fields_history: FieldsHistory) -> None:
    history = fields_history
    query = (ROOT / "database/fields-only-inventory.sql").read_text().strip().removesuffix(";")
    statement = f"SELECT row_to_json(i) FROM ({query}) i;"  # noqa: S608 - static repository SQL
    inventory = document(admin_sql(f"BEGIN READ ONLY; {statement} ROLLBACK;").encode())
    assert inventory["stored_format"] == "fields-only"
    assert inventory["form_version_id"] == str(history.form)
    assert inventory["definition"] == FIELDS_ONLY
    assert inventory["observations"] == inventory["packages"] == 1
    assert inventory["drafts"] == 0
    bindings = inventory["package_bindings"]
    assert isinstance(bindings, list)
    assert len(bindings) == 1
    assert isinstance(bindings[0], dict)
    assert bindings[0]["package_id"] == str(history.package)
    assert bindings[0]["current"] is True
