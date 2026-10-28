"""A new account joins Training and gets the seeded Practice garden through the real API (DB-20)."""

from collections.abc import Iterator
from hashlib import sha256
from pathlib import Path
from typing import Final
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import JsonValue, TypeAdapter

from fieldmaps_api.domain.form_definition import FORM_SCHEMA_VERSION, CanonicalDefinition
from fieldmaps_api.domain.zone_archive import extract_base_archive
from fieldmaps_api.form_schemas import FormVersionDetail
from fieldmaps_api.identity_schemas import Identity
from fieldmaps_api.site_schemas import Site
from tests.local_database import admin_sql
from tests.signing import Signer

ROOT: Final = Path(__file__).resolve().parents[2]
TRAINING: Final = UUID("10000000-0000-4000-8000-000000000102")
SITE: Final = UUID("10000000-0000-4000-8000-000000000103")
PACKAGE: Final = UUID("10000000-0000-4000-8000-000000000106")
PLAY: Final = UUID("10000000-0000-4000-8000-000000000104")
INVENTORY: Final = UUID("10000000-0000-4000-8000-000000000105")
GROUND_KINDS: Final = {"site", "grass", "dirt", "mulch", "blacktop", "structure", "equipment"}


@pytest.fixture
def new_user() -> Iterator[UUID]:
    user = uuid4()
    admin_sql(
        "INSERT INTO auth.users(id, instance_id, aud, role, email) VALUES "
        "(:'user', '00000000-0000-0000-0000-000000000000', 'authenticated', "
        "'authenticated', :'user' || '@test.invalid');",
        f"user={user}",
    )
    try:
        yield user
    finally:
        admin_sql("DELETE FROM auth.users WHERE id = :'user';", f"user={user}")


def fixture_features(*kinds: str) -> list[JsonValue]:
    garden = TypeAdapter(dict[str, JsonValue]).validate_json(
        (ROOT / "contracts/fixtures/sites/practice-garden.json").read_bytes()
    )
    features = TypeAdapter(list[dict[str, JsonValue]]).validate_python(garden["features"])
    return [
        feature
        for feature in features
        if TypeAdapter(dict[str, JsonValue]).validate_python(feature["properties"])["kind"] in kinds
    ]


def layer_features(payload: bytes) -> list[JsonValue]:
    collection = TypeAdapter(dict[str, JsonValue]).validate_json(payload)
    return TypeAdapter(list[JsonValue]).validate_python(collection["features"])


@pytest.mark.integration
def test_new_account_sees_the_training_site_and_downloads_its_verified_package(
    api_client: TestClient, signer: Signer, new_user: UUID
) -> None:
    # Given a new account that has only signed in
    api_client.headers["Authorization"] = f"Bearer {signer.issue(new_user)}"
    me = api_client.get("/v1/me")
    assert me.status_code == 200, me.text
    memberships = Identity.model_validate_json(me.content).project_memberships
    assert [(m.project_id, m.role, m.is_training) for m in memberships] == [
        (TRAINING, "observer", True)
    ]

    # When it lists Training's sites
    listed = api_client.get(f"/v1/projects/{TRAINING}/sites")
    assert listed.status_code == 200, listed.text

    # Then it sees the one Practice garden with its current package, naming both forms
    [site] = TypeAdapter(list[Site]).validate_json(listed.content)
    assert (site.site_id, site.code, site.name) == (SITE, "training-garden", "Practice garden")
    assert site.current_package_id == PACKAGE
    assert site.observation_count == 0
    assert site.zone_editing_available is False
    assert [(z.zone_code, z.label) for z in site.zones] == [("A", "Lawn bed"), ("B", "Sand bed")]
    assert site.package is not None
    package = site.package
    assert (package.package_version, package.state, package.zone_count) == (1, "ready", 2)
    assert package.forms == {
        "play": {"form_version_id": str(PLAY), "form_version": "training-v1"},
        "inventory": {
            "form_version_id": str(INVENTORY),
            "form_version": "training-inventory-v1",
        },
    }

    # And the archive it downloads matches its digest and the production reader accepts it
    archive = api_client.get(f"/v1/projects/{TRAINING}/packages/{PACKAGE}/archive")
    assert archive.status_code == 200
    assert sha256(archive.content).hexdigest() == package.archive_sha256
    base = extract_base_archive(archive.content, package.archive_sha256)
    assert base.site_code == "training-garden"
    assert [(z.zone_code, z.label) for z in base.zones] == [("A", "Lawn bed"), ("B", "Sand bed")]
    layers = {layer.name: layer_features(layer.payload) for layer in base.layers}
    assert layers["ground"] == fixture_features(*GROUND_KINDS)
    assert layers["paths"] == fixture_features("path")
    assert layers["trees"] == fixture_features("tree")
    assert len(layers["zones"]) == 2

    # And both forms are published, canonical and at the current schema version
    for code, version_id in (("training-v1", PLAY), ("training-inventory-v1", INVENTORY)):
        response = api_client.get(f"/v1/projects/{TRAINING}/form-versions/{code}")
        assert response.status_code == 200, response.text
        form = FormVersionDetail.model_validate_json(response.content)
        assert (form.version_id, form.state, form.schema_version) == (
            version_id,
            "published",
            FORM_SCHEMA_VERSION,
        )
        definition = CanonicalDefinition.model_validate(form.definition)
        assert (definition.version, definition.status) == (code, "published")
