from uuid import uuid4
import pytest
from tests.zone_api_fixtures import publish_draft, document
from tests.test_site_packages import submission

pytestmark = pytest.mark.integration

def test_retiring_pinned_form_strands_adopted_site(api_client, zone_site):
    current = publish_draft(api_client, zone_site)
    retired = api_client.post(zone_site.project_url + '/form-versions/shell-v1/retire')
    assert retired.status_code == 200, retired.text
    created = api_client.post(zone_site.drafts, json={'request_id':str(uuid4()), 'base_package_id':current['package_id']})
    assert created.status_code == 201, created.text
    url = zone_site.drafts + '/' + created.json()['draft_id']
    checked = api_client.post(url + '/validate', headers={'If-Match':created.headers['etag']})
    assert checked.status_code == 200, checked.text
    assert checked.json()['ready'] is False
    assert any(x['code'] == 'form_not_in_package' for x in checked.json()['issues'])
    published = api_client.post(url + '/publish', headers={'If-Match':created.headers['etag']}, json={'request_id':str(uuid4()),'expected_current_package_id':current['package_id']})
    assert published.status_code == 422, published.text
    assert 'form_not_in_package' in published.text
    restored = api_client.post(zone_site.project_url + '/form-versions/shell-v1/publish')
    assert restored.status_code == 422, restored.text
    print('CONFIRMED: retire=200, new draft=201, validation not ready, publish=422, legacy form republish=422')

def test_managed_import_coerces_numeric_source_id(api_client, zone_site):
    current = publish_draft(api_client, zone_site)
    draft = api_client.post(zone_site.drafts, json={'request_id':str(uuid4()),'base_package_id':current['package_id']})
    zone = draft.json()['zones'][0]
    body = submission(request_id=str(uuid4()), expected_current_package_id=current['package_id'], change_note='Synthetic numeric ID probe', zone_identity_map=[{'source_feature_id':'123','zone_id':zone['zone_id'],'zone_code':zone['zone_code']}])
    body['layers']['zones']['features'][0]['properties'] = {'id':123,'name':'Synthetic numeric identity'}
    result = api_client.post(zone_site.project_url + '/packages', json=body)
    assert result.status_code == 201, result.text
    print('CONFIRMED: numeric source id 123 matches string mapping "123" and publishes format',result.json()['format'])

def test_discovery_reextracts_managed_archive(api_client, zone_site, monkeypatch):
    current = publish_draft(api_client, zone_site)
    from fieldmaps_api.services import zone_archives
    original = zone_archives.extract
    calls = []
    async def observed(archive):
        calls.append(len(archive[0]))
        return await original(archive)
    monkeypatch.setattr(zone_archives, 'extract', observed)
    for _ in range(2):
        result = api_client.get(f'/v2/projects/{zone_site.tenant.project}/sites')
        assert result.status_code == 200, result.text
    assert len(calls) == 2
    print('CONFIRMED: two unchanged managed-site discovery requests run two archive extractions; sizes',calls)

def test_demoted_manager_can_finalize_after_waiting_for_site_lock(api_client, zone_site, monkeypatch, signer):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Event
    import time
    import anyio
    from tests.local_database import admin_sql
    from tests.zone_api_fixtures import create_draft
    from fieldmaps_api.services import zone_archives
    url, etag, _ = create_draft(api_client, zone_site)
    admin_sql("INSERT INTO fieldmaps.project_memberships(organization_id,project_id,user_id,role) VALUES(:'org',:'project',:'actor','manager');", *zone_site.tenant.variables(), f"actor={zone_site.tenant.users['admin']}")
    prepared, proceed = Event(), Event()
    original = zone_archives.prepare
    async def pause_after_preparation(*args, **kwargs):
        result = await original(*args, **kwargs)
        prepared.set()
        assert await anyio.to_thread.run_sync(lambda: proceed.wait(10))
        return result
    monkeypatch.setattr(zone_archives, 'prepare', pause_after_preparation)
    def wait_sql(sql):
        for _ in range(80):
            if admin_sql(sql) == 't':
                return
            time.sleep(.025)
        raise AssertionError('No observed SQL lock barrier')
    with ThreadPoolExecutor(max_workers=2) as pool:
        publication = pool.submit(api_client.post, url+'/publish', headers={'If-Match':etag}, json={'request_id':str(uuid4()),'expected_current_package_id':str(zone_site.package_id)})
        assert prepared.wait(10)
        hold = pool.submit(admin_sql, "SET application_name='zone-review-holder'; BEGIN; SELECT id FROM fieldmaps.sites WHERE id=:'site' FOR UPDATE; SELECT pg_sleep(2); COMMIT;", *zone_site.tenant.variables())
        wait_sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='zone-review-holder' AND wait_event='PgSleep');")
        proceed.set()
        wait_sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE usename='fieldmaps_api' AND wait_event_type='Lock' AND query LIKE '%finalize_zone_package%');")
        demoted = api_client.patch(zone_site.project_url + '/members/' + str(zone_site.tenant.users['manager']), json={'role':'viewer'}, headers={'Authorization':'Bearer ' + signer.issue(zone_site.tenant.users['admin'])})
        assert demoted.status_code == 204, demoted.text
        response = publication.result(timeout=15)
        hold.result(timeout=15)
        assert response.status_code == 201, response.text
        assert admin_sql("SELECT count(*) FROM fieldmaps.zone_publications WHERE project_id=:'project';", *zone_site.tenant.variables()) == '1'
        print('CONFIRMED: manager demotion committed while finalizer waited on site lock; HTTP publish still returned 201')
