"""Sites, forms and records as a manager's workspace and an observer's device use them."""

import csv
from collections.abc import Iterator
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.forms import FormDefinition
from fieldmaps_api.errors import ErrorEnvelope
from fieldmaps_api.form_schemas import FormSummary, FormVersionDetail
from fieldmaps_api.site_schemas import Site
from fieldmaps_api.tenancy_schemas import ProjectMember
from fieldmaps_api.zone_response_schemas import HistoricalZones, PackageForms, Publication
from tests.local_database import admin_sql
from tests.package_fixtures import submission
from tests.signing import Signer
from tests.tenant_fixtures import (
    Tenant,
    cleanup_tenant,
    create_tenant,
    observation_payload,
    sign_in,
)
from tests.test_observation_analysis_exports import files

pytestmark = pytest.mark.integration

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts" / "forms"
FORMS = TypeAdapter(list[FormSummary])
SITES = TypeAdapter(list[Site])
MEMBERS = TypeAdapter(list[ProjectMember])
DEFINITION: TypeAdapter[dict[str, JsonValue]] = TypeAdapter(dict[str, JsonValue])


@pytest.fixture
def tenant(api_client: TestClient, signer: Signer) -> Iterator[Tenant]:
    value = Tenant.new()
    create_tenant(value)
    sign_in(api_client, signer, value.users["manager"])
    try:
        yield value
    finally:
        cleanup_tenant(value)


def inventory() -> dict[str, JsonValue]:
    return DEFINITION.validate_json((CONTRACTS / "janet-inventory-v1.json").read_bytes())


def error(response_content: bytes) -> ErrorEnvelope:
    return ErrorEnvelope.model_validate_json(response_content)


def start_inventory(client: TestClient, base: str) -> FormVersionDetail:
    created = client.post(
        f"{base}/forms",
        json={"code": "inventory", "name": "Inventory round", "definition": inventory()},
    )
    assert created.status_code == 201, created.text
    return FormVersionDetail.model_validate_json(created.content)


def test_a_manager_drafts_edits_and_publishes_a_form(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    draft = start_inventory(api_client, base)
    assert (draft.code, draft.version, draft.state, draft.form_code) == (
        "inventory-v1",
        1,
        "draft",
        "inventory",
    )
    # The stored definition names the version it is, so devices key records by it.
    assert (draft.definition["version"], draft.definition["status"]) == ("inventory-v1", "draft")
    assert draft.question_count > 0
    duplicate = api_client.post(
        f"{base}/forms",
        json={"code": "inventory", "name": "Again", "definition": inventory()},
    )
    assert duplicate.status_code == 409, duplicate.text

    # Drafts are the managers' alone: an observer neither sees one nor uploads against it.
    sign_in(api_client, signer, tenant.users["observer"])
    listed = FORMS.validate_json(api_client.get(f"{base}/forms").content)
    assert next(form for form in listed if form.code == "inventory").versions == []
    assert api_client.get(f"{base}/form-versions/inventory-v1").status_code == 404
    assert api_client.post(f"{base}/form-versions/inventory-v1/publish").status_code == 403

    sign_in(api_client, signer, tenant.users["manager"])
    edited = api_client.put(
        f"{base}/form-versions/inventory-v1",
        json={"definition": {**inventory(), "title": "Inventory, by zone"}},
        headers={"If-Match": draft.etag},
    )
    assert edited.status_code == 200, edited.text
    assert FormVersionDetail.model_validate_json(edited.content).title == "Inventory, by zone"
    broken = api_client.put(
        f"{base}/form-versions/inventory-v1",
        json={"definition": {**inventory(), "questions": 3}},
        headers={"If-Match": FormVersionDetail.model_validate_json(edited.content).etag},
    )
    assert broken.status_code == 422, broken.text
    assert error(broken.content).error.details["fields"] == [
        {"id": "definition", "problem": error(broken.content).error.message}
    ]

    published = api_client.post(
        f"{base}/form-versions/inventory-v1/publish",
        headers={"If-Match": FormVersionDetail.model_validate_json(edited.content).etag},
    )
    assert published.status_code == 200, published.text
    version = FormVersionDetail.model_validate_json(published.content)
    assert (version.state, version.definition["status"]) == ("published", "published")
    assert version.published_at is not None
    assert version.title == "Inventory, by zone"


def test_a_published_version_is_frozen_and_the_next_starts_as_a_copy(
    api_client: TestClient, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    draft = start_inventory(api_client, base)
    api_client.headers["If-Match"] = draft.etag
    assert api_client.post(f"{base}/form-versions/inventory-v1/publish").status_code == 200
    saved = api_client.put(f"{base}/form-versions/inventory-v1", json={"definition": inventory()})
    assert saved.status_code == 409, saved.text
    assert api_client.delete(f"{base}/form-versions/inventory-v1").status_code == 409
    assert api_client.post(f"{base}/form-versions/inventory-v1/publish").status_code == 409

    following = api_client.post(f"{base}/forms/inventory/versions", json={})
    assert following.status_code == 201, following.text
    second = FormVersionDetail.model_validate_json(following.content)
    assert (second.code, second.version, second.state) == ("inventory-v2", 2, "draft")
    assert (second.definition["version"], second.definition["status"]) == ("inventory-v2", "draft")
    listed = FORMS.validate_json(api_client.get(f"{base}/forms").content)
    versions = next(form for form in listed if form.code == "inventory").versions
    assert [(item.code, item.state) for item in versions] == [
        ("inventory-v2", "draft"),
        ("inventory-v1", "published"),
    ]
    assert (
        api_client.delete(
            f"{base}/form-versions/inventory-v2", headers={"If-Match": second.etag}
        ).status_code
        == 204
    )
    assert api_client.get(f"{base}/form-versions/inventory-v2").status_code == 404


def test_a_manager_of_another_organization_cannot_reach_the_forms(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    _ = start_inventory(api_client, base)
    other = Tenant.new()
    create_tenant(other)
    try:
        # Another tenant's project does not exist for them; writing to it needs its manager.
        sign_in(api_client, signer, other.users["manager"])
        for path in ("forms", "sites", "observations", "form-versions/inventory-v1"):
            assert api_client.get(f"{base}/{path}").status_code == 404, path
        assert api_client.post(f"{base}/form-versions/inventory-v1/publish").status_code == 403
        assert api_client.delete(f"{base}/form-versions/inventory-v1").status_code == 403
        assert (
            api_client.post(f"{base}/sites", json={"code": "x-1", "name": "x"}).status_code == 403
        )
    finally:
        cleanup_tenant(other)


def test_form_definitions_are_checked_as_the_collector_reads_them(
    api_client: TestClient, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    unanswerable = inventory()
    questions = unanswerable["questions"]
    assert isinstance(questions, list)
    first = questions[0]
    assert isinstance(first, dict)
    unanswerable["questions"] = [{**first, "options": []}, *questions[1:]]
    refused = api_client.post(
        f"{base}/forms", json={"code": "broken", "name": "Broken", "definition": unanswerable}
    )
    assert refused.status_code == 422, refused.text
    assert error(refused.content).error.message.startswith("This form cannot be used yet.")
    listed = FORMS.validate_json(api_client.get(f"{base}/forms").content)
    assert all(form.code != "broken" for form in listed)
    assert api_client.post(f"{base}/forms/missing/versions", json={}).status_code == 404
    bad_code = api_client.post(
        f"{base}/forms", json={"code": "Has Spaces", "name": "x", "definition": inventory()}
    )
    assert bad_code.status_code == 422


def test_an_explicit_empty_definition_is_not_replaced_with_a_copy(
    api_client: TestClient, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    start_inventory(api_client, base)
    rejected = api_client.post(f"{base}/forms/inventory/versions", json={"definition": {}})
    assert rejected.status_code == 422, rejected.text
    listed = FORMS.validate_json(api_client.get(f"{base}/forms").content)
    versions = next(form for form in listed if form.code == "inventory").versions
    assert [version.code for version in versions] == ["inventory-v1"]


@pytest.mark.parametrize("question_id", ["zone", "round_type", "first_round", "placement"])
def test_question_ids_are_independent_of_record_metadata(
    api_client: TestClient, tenant: Tenant, question_id: str
) -> None:
    base = f"/v1/projects/{tenant.project}"
    definition = inventory()
    questions = definition["questions"]
    assert isinstance(questions, list)
    first = questions[0]
    assert isinstance(first, dict)
    definition["questions"] = [{**first, "id": question_id}, *questions[1:]]
    created = api_client.post(
        f"{base}/forms", json={"code": "nested", "name": "Nested", "definition": definition}
    )
    assert created.status_code == 201, created.text
    stored = FormVersionDetail.model_validate_json(created.content)
    # Authoring owns column names; reserved IDs remain valid nested answer keys.
    stored_questions = stored.definition["questions"]
    assert isinstance(stored_questions, list)
    assert stored.definition["columnNaming"] == "questionId"
    for saved, submitted in zip(stored_questions, definition["questions"], strict=True):
        assert isinstance(saved, dict)
        assert isinstance(submitted, dict)
        assert saved["exportColumn"] == saved["id"]
        assert {key: value for key, value in saved.items() if key != "exportColumn"} == {
            key: value for key, value in submitted.items() if key != "exportColumn"
        }


@pytest.mark.parametrize("number", [1, 2])
def test_canonical_practice_form_publish_package_upload_read_and_export(
    api_client: TestClient, signer: Signer, tenant: Tenant, number: int
) -> None:
    base = f"/v1/projects/{tenant.project}"
    original = api_client.get(f"{base}/form-versions/shell-v1")
    assert original.status_code == 200, original.text
    frozen = FormVersionDetail.model_validate_json(original.content)
    definition = FormDefinition.model_validate(frozen.definition)
    assert [
        (q.id, q.required, q.min, q.max, q.max_length, q.export_column)
        for q in definition.questions
    ] == [
        ("people", True, 0, 999, None, "people"),
        ("notes", False, None, None, 1000, "notes"),
    ]
    code = f"shell-v{number}"
    if number == 2:
        started = api_client.post(f"{base}/forms/shell/versions", json={})
        assert started.status_code == 201, started.text
        draft = FormVersionDetail.model_validate_json(started.content)
        assert draft.code == code
        assert draft.definition["questions"] == frozen.definition["questions"]
        published = api_client.post(
            f"{base}/form-versions/{code}/publish", headers={"If-Match": draft.etag}
        )
        assert published.status_code == 200, published.text
    created = api_client.post(
        f"{base}/packages", json=submission(site_id=str(tenant.site), form_version=code)
    )
    assert created.status_code == 201, created.text
    package = Publication.model_validate_json(created.content).package.package_id
    zone_response = api_client.get(
        f"{base}/sites/{tenant.site}/zones", params={"package_id": str(package)}
    )
    zones = HistoricalZones.model_validate_json(zone_response.content)
    zone = zones.zones[0].zone_id
    sign_in(api_client, signer, tenant.users["observer"])
    url = f"{base}/observations/{tenant.observation}"
    body = observation_payload(tenant.site, package, zone)
    body.update(form_version=code, answers={"people": 999, "notes": "café"})
    for answers in (
        {},
        {"people": -1},
        {"people": 1000},
        {"people": 1.5},
        {"people": True},
        {"people": 1, "notes": "x" * 1001},
    ):
        invalid = api_client.put(url, json={**body, "answers": answers})
        assert invalid.status_code == 422, invalid.text
    accepted = api_client.put(url, json=body)
    assert accepted.status_code == 200, accepted.text
    assert api_client.put(url, json=body).content == accepted.content
    assert api_client.put(url, json={**body, "answers": {"people": 0}}).status_code == 409
    detail = api_client.get(url)
    assert detail.status_code == 200, detail.text
    assert detail.json()["answers"] == {"people": 999, "notes": "café"}
    assert detail.json()["form_version"] == code
    assert detail.json()["package_id"] == str(package)
    assert detail.json()["zone_id"] == str(zone)
    sign_in(api_client, signer, tenant.users["viewer"])
    assert_practice_exports(api_client, base, code, str(package), str(zone))


def assert_practice_exports(
    api_client: TestClient, base: str, code: str, package: str, zone: str
) -> None:
    exported = api_client.get(f"{base}/observations/export", params={"format": "csv"})
    assert exported.status_code == 200, exported.text
    assets = files(exported.content)
    row = next(csv.DictReader(StringIO(assets["observations.csv"].decode("utf-8-sig"))))
    assert (
        row["people"],
        row["notes"],
        row["form_version"],
        row["package_id"],
        row["zone_id"],
    ) == ("999", "café", code, package, zone)
    exported = api_client.get(f"{base}/observations/export", params={"format": "geojson"})
    assert exported.status_code == 200, exported.text
    assets = files(exported.content)
    collection = DEFINITION.validate_json(assets["observations.geojson"])
    features = collection["features"]
    assert isinstance(features, list)
    feature = features[0]
    assert isinstance(feature, dict)
    properties = feature["properties"]
    assert isinstance(properties, dict)
    assert properties["answers"] == {"people": 999, "notes": "café"}
    assert (properties["people"], properties["notes"]) == (999, "café")
    assert code in DEFINITION.validate_json(assets["forms.json"])


def test_viewers_and_observers_cannot_author_forms(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    for role in ("observer", "viewer"):
        sign_in(api_client, signer, tenant.users[role])
        response = api_client.post(
            f"{base}/forms", json={"code": f"by-{role}", "name": role, "definition": inventory()}
        )
        assert response.status_code == 403, response.text


def test_a_manager_creates_and_renames_sites(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    created = api_client.post(
        f"{base}/sites",
        json={"code": "north-yard", "name": "  North yard ", "description": "Behind the gym"},
    )
    assert created.status_code == 201, created.text
    site = Site.model_validate_json(created.content)
    assert (site.code, site.name) == ("north-yard", "North yard")
    assert site.description == "Behind the gym"
    assert (site.package, site.zones, site.observation_count) == (None, [], 0)
    assert (
        api_client.post(f"{base}/sites", json={"code": "north-yard", "name": "Again"}).status_code
        == 409
    )

    site_path = f"{base}/sites/{site.site_id}"
    renamed = api_client.patch(site_path, json={"name": "North play yard"})
    assert renamed.status_code == 200, renamed.text
    assert Site.model_validate_json(renamed.content).description == "Behind the gym"
    cleared = api_client.patch(site_path, json={"description": None})
    assert Site.model_validate_json(cleared.content).description is None
    assert api_client.patch(site_path, json={"name": None}).status_code == 422
    assert api_client.patch(f"{base}/sites/{uuid4()}", json={"name": "x"}).status_code == 404

    sign_in(api_client, signer, tenant.users["observer"])
    assert api_client.post(f"{base}/sites", json={"code": "mine", "name": "x"}).status_code == 403
    assert api_client.patch(site_path, json={"name": "x"}).status_code == 403
    codes = [item.code for item in SITES.validate_json(api_client.get(f"{base}/sites").content)]
    assert codes == ["sample-garden", "north-yard"]  # by name: "Isolation site", "North play yard"


def test_a_site_reports_its_current_package_and_zones(
    api_client: TestClient, tenant: Tenant
) -> None:
    base = f"/v1/projects/{tenant.project}"
    prepared = api_client.post(f"{base}/packages", json=submission(site_id=str(tenant.site)))
    assert prepared.status_code == 201, prepared.text
    publication = Publication.model_validate_json(prepared.content)
    site = Site.model_validate_json(api_client.get(f"{base}/sites/{tenant.site}").content)
    assert site.package is not None
    package_forms = PackageForms.model_validate(site.package.forms)
    assert (site.package.package_version, package_forms.play.form_version) == (
        1,
        "shell-v1",
    )
    assert site.current_package_id == publication.package.package_id
    assert [(zone.zone_code, zone.label) for zone in site.zones] == [("A", "Lawn")]
    assert site.extent is not None
    assert site.centre is not None
    assert site.observation_count == 0


def test_a_package_needs_a_published_form(api_client: TestClient, tenant: Tenant) -> None:
    base = f"/v1/projects/{tenant.project}"
    created = api_client.post(
        f"{base}/forms",
        json={"code": "inventory", "name": "Inventory round", "definition": inventory()},
    )
    assert created.status_code == 201, created.text
    refused = api_client.post(
        f"{base}/packages",
        json=submission(site_id=str(tenant.site), form_version="inventory-v1"),
    )
    assert refused.status_code == 422, refused.text
    issues = error(refused.content).error.details["issues"]
    assert isinstance(issues, list)
    assert issues
    issue = issues[0]
    assert isinstance(issue, dict)
    assert issue["code"] == "form_not_in_package"


def test_a_manager_sees_their_team_by_name(
    api_client: TestClient, signer: Signer, tenant: Tenant
) -> None:
    admin_sql(
        "UPDATE fieldmaps.profiles SET display_name='Avery Observer', observer_initials='AO' "
        "WHERE user_id=:'observer';",
        *tenant.variables(),
    )
    members = MEMBERS.validate_json(
        api_client.get(f"/v1/projects/{tenant.project}/members").content
    )
    observer = next(member for member in members if member.user_id == tenant.users["observer"])
    assert (observer.display_name, observer.observer_initials) == ("Avery Observer", "AO")
    # The team list, with its names, is the managers' alone.
    sign_in(api_client, signer, tenant.users["viewer"])
    assert api_client.get(f"/v1/projects/{tenant.project}/members").status_code == 403
