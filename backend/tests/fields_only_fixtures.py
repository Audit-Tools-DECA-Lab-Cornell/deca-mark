"""Synthetic existing-installation state; never rewrite an initialized form."""

import json
from dataclasses import dataclass
from hashlib import sha256
from io import BytesIO
from typing import Final
from uuid import UUID, uuid4
from zipfile import ZipFile

import rfc8785
from pydantic import JsonValue

from fieldmaps_api.zone_response_schemas import HistoricalZones, Publication
from tests.local_database import admin_sql, disposable_database_selected
from tests.package_fixtures import submission
from tests.tenant_fixtures import observation_payload
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import document

# The exact two fields from the pre-cleanup baseline, including optional blank text.
FIELDS_ONLY: Final[dict[str, JsonValue]] = {
    "fields": [
        {"code": "people", "type": "integer", "minimum": 0, "maximum": 999, "required": True},
        {"code": "notes", "type": "text", "required": False, "maxLength": 1000},
    ],
    "status": "practice-only",
}


@dataclass(frozen=True)
class FieldsHistory:
    api: LiveApi
    form: UUID
    package: UUID
    zone: UUID
    observation: UUID
    archive: bytes

    @property
    def project(self) -> str:
        return f"/v1/projects/{self.api.tenant.project}"

    def body(self) -> dict[str, JsonValue]:
        return {
            **observation_payload(self.api.tenant.site, self.package, self.zone),
            "form_version": "historic-v1",
            "answers": {"people": 0, "notes": ""},
        }

    def frozen(self) -> str:
        return admin_sql(
            "SELECT jsonb_build_object('definition',f.definition,'observation',to_jsonb(o),"
            "'package',to_jsonb(p)-'archive','archive',encode(p.archive,'hex'),"
            "'zones',(SELECT jsonb_agg(to_jsonb(z) ORDER BY z.zone_id) "
            "FROM fieldmaps.package_zones z WHERE z.package_id=p.id)) "
            "FROM fieldmaps.form_versions f,fieldmaps.observations o,fieldmaps.site_packages p "
            "WHERE f.id=:'form' AND o.id=:'observation' AND p.id=:'package';",
            f"form={self.form}",
            f"observation={self.observation}",
            f"package={self.package}",
        )


def seed_history(api: LiveApi) -> FieldsHistory:
    assert disposable_database_selected(), "Existing-record fixture requires disposable selection"
    form, observation = uuid4(), uuid4()
    tenant = api.tenant
    admin_sql(
        "INSERT INTO fieldmaps.form_versions(id,organization_id,project_id,code,definition) "
        "VALUES (:'legacy',:'org',:'project','historic-v1',:'definition'::jsonb);",
        *tenant.variables(),
        f"legacy={form}",
        f"definition={json.dumps(FIELDS_ONLY)}",
    )
    project = f"/v1/projects/{tenant.project}"
    with api.client() as manager:
        created = manager.post(
            f"{project}/packages",
            json=submission(site_id=str(tenant.site), form_version="historic-v1"),
        )
        assert created.status_code == 201, created.text
        package = Publication.model_validate_json(created.content).package
        zones = manager.get(
            f"{project}/sites/{tenant.site}/zones", params={"package_id": str(package.package_id)}
        )
        assert zones.status_code == 200, zones.text
        zone = HistoricalZones.model_validate_json(zones.content).zones[0].zone_id
        archive = manager.get(f"{project}/packages/{package.package_id}/archive")
        assert archive.status_code == 200, archive.text
        assert sha256(archive.content).hexdigest() == package.archive_sha256
        with ZipFile(BytesIO(archive.content)) as contents:
            assert set(contents.namelist()) == {
                "manifest.json",
                "layers/ground.json",
                "layers/zones.json",
                "layers/paths.json",
                "layers/trees.json",
            }
            manifest = document(contents.read("manifest.json"))
            forms = manifest["forms"]
            assert isinstance(forms, dict)
            assert forms["play"] == {
                "form_version_id": str(form),
                "form_version": "historic-v1",
            }
    history = FieldsHistory(api, form, package.package_id, zone, observation, archive.content)
    body = history.body()
    # An independently authored JCS document seeds the pre-existing retry receipt.
    # Do not use production fingerprint/normalization to manufacture the expectation.
    digest = sha256(
        rfc8785.dumps(
            {
                "canonicalization_version": "observation-jcs-1",
                "project_id": str(tenant.project),
                "observation_id": str(observation),
                "user_id": str(tenant.users["observer"]),
                "payload": {**body, "observed_at": "2026-09-17T12:00:00.000000Z"},
            }
        )
    ).hexdigest()
    admin_sql(
        "BEGIN; SET LOCAL ROLE fieldmaps_api; "
        "SELECT set_config('fieldmaps.user_id',:'observer',true); "
        "INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,"
        "form_version_id,observer_code,observed_at,geom,answers,created_by,upload_hash,"
        "package_id,zone_id,round_type,first_round,placement_source) "
        "VALUES (:'observation',:'org',:'project',:'site',:'legacy','QA',"
        "'2026-09-17T12:00:00Z',fieldmaps.make_point(-76.485,42.448),"
        "'{\"people\":0,\"notes\":\"\"}',:'observer',:'digest',:'package',:'zone',"
        "'standard',true,'hand'); COMMIT;",
        *tenant.variables(),
        f"observation={observation}",
        f"legacy={form}",
        f"digest={digest}",
        f"package={package.package_id}",
        f"zone={zone}",
    )
    return history
