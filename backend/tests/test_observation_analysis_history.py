from uuid import UUID, uuid4

from fastapi.testclient import TestClient

from fieldmaps_api.observation_analysis_schemas import ObservationSummary
from tests.local_database import admin_sql
from tests.observation_analysis_fixtures import AnalysisSite, read_page
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


def test_half_open_dst_interval_when_offsets_span_repeated_hour(
    api_client: TestClient, analysis_site: AnalysisSite
) -> None:
    # Given events at both UTC instants represented by the repeated local DST hour.
    tenant = analysis_site.bound.site.tenant
    admin_sql(
        """
INSERT INTO fieldmaps.observations(id,organization_id,project_id,site_id,form_version_id,
observer_code,observed_at,geom,answers,created_by,upload_hash,round_type,first_round,
placement_source,package_id,zone_id)
SELECT gen_random_uuid(),:'org',:'project',:'site',:'form','DST',instant,
extensions.ST_SetSRID(extensions.ST_MakePoint(-76.485,42.448),4326),'{}',:'observer',
md5(instant::text)||md5(instant::text),'standard',true,'hand',
:'package', :'zone'
FROM unnest(ARRAY[
    '2026-11-01T05:30:00Z'::timestamptz,
    '2026-11-01T06:30:00Z'::timestamptz
]) AS instants(instant);
""",
        *tenant.variables(),
        f"package={analysis_site.bound.package}",
        f"zone={analysis_site.bound.zone}",
    )
    params = {
        "observer": "DST",
        "site_id": str(tenant.site),
        "package_id": str(analysis_site.bound.package),
        "observed_from": "2026-11-01T01:30:00-04:00",
        "observed_before": "2026-11-01T01:30:00-05:00",
    }
    # When the first instant is inclusive and the second exclusive.
    page = read_page(api_client, analysis_site.url, **params)
    summary = api_client.get(analysis_site.url + "/summary", params=params)
    # Then the shared half-open filter gives exactly one result.
    assert page.total_matching == 1
    assert ObservationSummary.model_validate_json(summary.content).total_matching == 1
