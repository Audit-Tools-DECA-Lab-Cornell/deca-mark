from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from fieldmaps_api.observation_analysis_schemas import (
    HistoricalObservationDetail,
    ObservationSummary,
)
from tests.local_database import admin_sql
from tests.observation_analysis_fixtures import AnalysisSite, read_page
from tests.signing import Signer
from tests.tenant_fixtures import TRAINING, sign_in
from tests.test_bound_upload_bindings import (
    test_inventory_uses_explicit_package_role_and_stores_zone_anchor,
)
from tests.test_observation_analysis_exports import files
from tests.zone_api_fixtures import ZoneSite, create_draft, document, zones_body

pytest_plugins = ("tests.observation_analysis_fixtures",)


def test_historical_labels_when_zone_is_renamed_in_successor(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given an observation bound before a zone's label changes.
    bound = analysis_site.bound
    original = read_page(api_client, analysis_site.url, package_id=str(bound.package)).items[0]
    site = ZoneSite(bound.site.tenant, bound.package)
    url, etag, draft = create_draft(api_client, site)
    edited = api_client.put(
        url,
        headers={"If-Match": etag, "Content-Type": "application/json"},
        content=zones_body(draft, label="=New label"),
    )
    assert edited.status_code == 200, edited.text
    published = api_client.post(
        url + "/publish",
        headers={"If-Match": edited.headers["etag"]},
        json={"request_id": str(uuid4()), "expected_current_package_id": str(bound.package)},
    )
    assert published.status_code == 201, published.text
    result = document(published.content)["package"]
    assert isinstance(result, dict)
    new_package = UUID(str(result["package_id"]))
    new_id = uuid4()
    uploaded = api_client.put(bound.url(new_id), json=bound.point(package_id=str(new_package)))
    assert uploaded.status_code == 200, uploaded.text
    # When the stable zone is queried across versions.
    page = read_page(
        api_client, analysis_site.url, site_id=str(site.tenant.site), zone_id=str(bound.zone)
    )
    # Then exact snapshot joins preserve both historical labels and package versions.
    labels = {row.package_id: row.zone_label for row in page.items}
    assert labels[bound.package] == original.zone_label
    assert labels[new_package] == "=New label"
    assert len(page.items) == 2


def test_inventory_geometry_when_bound_or_legacy_inventory_is_read(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given a real bound Inventory uploaded by the established form/publication pipeline.
    test_inventory_uses_explicit_package_role_and_stores_zone_anchor(
        api_client, analysis_site.bound
    )
    tenant = analysis_site.bound.site.tenant
    legacy = uuid4()
    admin_sql(
        """
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
observer_code,observed_at,geom,answers,created_by,upload_hash,round_type,placement_source,zone_code)
VALUES(:'id',:'org',:'project',:'site',:'form','QA','2026-11-01T06:30:00Z',
fieldmaps.make_point(-76.485,42.448),'{}',:'observer',repeat('a',64),'inventory','zone','same');
""",
        *tenant.variables(),
        f"id={legacy}",
    )
    # When both recorded bases are read with the same Inventory filter.
    page = read_page(api_client, analysis_site.url, round_type="inventory")
    # Then both have null event geometry and separately marked anchors.
    assert len(page.items) == 2
    assert all(row.geometry is None and row.spatial_support == "zone" for row in page.items)
    assert {row.display_anchor_basis for row in page.items} == {"snapshot", "legacy_compatibility"}
    response = api_client.get(f"{analysis_site.url}/{legacy}")
    detail = HistoricalObservationDetail.model_validate_json(response.content)
    assert detail.package_id is None
    assert detail.zone_label is None


def test_half_open_dst_interval_when_offsets_span_repeated_hour(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given events at both UTC instants represented by the repeated local DST hour.
    tenant = analysis_site.bound.site.tenant
    admin_sql(
        """
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
observer_code,observed_at,geom,answers,created_by,upload_hash,round_type,placement_source,zone_code)
SELECT gen_random_uuid(),:'org',:'project',:'site',:'form','DST',instant,
fieldmaps.make_point(-76.485,42.448),'{}',:'observer',repeat('d',64),'standard','hand','same'
FROM unnest(ARRAY['2026-11-01T05:30:00Z'::timestamptz,'2026-11-01T06:30:00Z'::timestamptz]) instant;
""",
        *tenant.variables(),
    )
    params = {
        "observer": "DST",
        "observed_from": "2026-11-01T01:30:00-04:00",
        "observed_before": "2026-11-01T01:30:00-05:00",
        "assignment_basis": "legacy_unversioned",
    }
    # When the first instant is inclusive and the second exclusive.
    page = read_page(api_client, analysis_site.url, **params)
    summary = api_client.get(analysis_site.url + "/summary", params=params)
    # Then the shared half-open filter gives exactly one result.
    assert page.total_matching == 1
    assert ObservationSummary.model_validate_json(summary.content).total_matching == 1


def test_legacy_code_scope_when_two_sites_share_code(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given two sites recording the same legacy zone code.
    tenant = analysis_site.bound.site.tenant
    second = uuid4()
    admin_sql(
        """
INSERT INTO fieldmaps.sites(id,organization_id,project_id,code,name)
VALUES(:'second',:'org',:'project','second-synthetic','Second synthetic');
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
observer_code,observed_at,geom,answers,created_by,upload_hash,zone_code)
SELECT gen_random_uuid(),:'org',:'project',site,:'form','SCOPED',now(),
fieldmaps.make_point(-76.485,42.448),'{}',:'observer',repeat('e',64),'A'
FROM unnest(ARRAY[:'site'::uuid,:'second'::uuid]) site;
""",
        *tenant.variables(),
        f"second={second}",
    )
    # When legacy code filtering names exactly one permitted site.
    page = read_page(
        api_client,
        analysis_site.url,
        site_id=str(second),
        assignment_basis="legacy_unversioned",
        legacy_zone_code="A",
    )
    # Then the other site's identical code contributes no result or fabricated label.
    assert page.total_matching == 1
    assert page.items[0].site_name == "Second synthetic"
    assert page.items[0].zone_label is None
    invalid = api_client.get(
        analysis_site.url, params={"site_id": str(second), "zone_id": str(analysis_site.bound.zone)}
    )
    assert invalid.status_code == 422


def test_training_ownership_when_two_accounts_share_training_project(
    api_client: TestClient, analysis_site: AnalysisSite, signer: Signer
) -> None:
    # Given two registered trainees and one synthetic practice record each.
    tenant = analysis_site.bound.site.tenant
    for user in (tenant.users["manager"], tenant.users["observer"]):
        sign_in(api_client, signer, user)
        assert api_client.get("/v1/me").status_code == 200
        admin_sql(
            """
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
observer_code,observed_at,geom,answers,created_by,upload_hash)
SELECT gen_random_uuid(),s.organization_id,s.project_id,s.id,f.id,'BE20TRAIN',now(),
fieldmaps.make_point(-76.485,42.448),'{}',:'user',repeat('b',64)
FROM fieldmaps.sites s JOIN fieldmaps.form_versions f ON f.project_id=s.project_id
WHERE s.project_id=:'training';
""",
            f"user={user}",
            f"training={TRAINING}",
        )
    url = f"/v2/projects/{TRAINING}/observations"
    # When the current trainee queries the common scope.
    page = read_page(api_client, url, observer="BE20TRAIN")
    summary = api_client.get(url + "/summary", params={"observer": "BE20TRAIN"})
    exported = api_client.get(url + "/export", params={"observer": "BE20TRAIN"})
    # Then RLS applies equally to page, summary and complete export.
    assert page.total_matching == 1
    assert page.items[0].user_id == tenant.users["observer"]
    assert ObservationSummary.model_validate_json(summary.content).total_matching == 1
    assert exported.status_code == 200
    assert document(files(exported.content)["metadata.json"])["total_matching"] == 1
