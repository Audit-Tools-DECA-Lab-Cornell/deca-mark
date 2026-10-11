from fieldmaps_api.openapi import export_openapi


def test_zone_routes_are_exposed_with_uuid_site_resources() -> None:
    contract = export_openapi()
    assert b'"/v1/projects/{project_id}/sites/{site_id}/zone-drafts"' in contract
    assert b'"/v2/projects/{project_id}/sites"' in contract
    assert b'"/v1/projects/{project_id}/sites/{site_code}"' in contract
