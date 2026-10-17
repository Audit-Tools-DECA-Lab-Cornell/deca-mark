"""Baseline reproduction against the explicitly selected disposable database."""
from fastapi.testclient import TestClient
from fieldmaps_api.auth import JwksVerifier
from fieldmaps_api.main import create_app
from tests.local_database import database_settings, disposable_database_selected
from tests.signing import ISSUER, make_signer
from tests.tenant_fixtures import Tenant, create_tenant, cleanup_tenant, sign_in
from tests.test_workspace_api import start_inventory

assert disposable_database_selected(), "Select a fresh disposable database before reproducing"
signer = make_signer()
tenant = Tenant.new()
create_tenant(tenant)
try:
    with TestClient(create_app(database_settings(), JwksVerifier(ISSUER, "authenticated", signer))) as client:
        sign_in(client, signer, tenant.users["manager"])
        base = f"/v1/projects/{tenant.project}"
        draft = start_inventory(client, base)
        url = f"{base}/form-versions/{draft.code}"
        a = client.get(url).json()["definition"]
        b = client.get(url).json()["definition"]
        a["title"] = "A's newer title"
        first = client.put(url, json={"definition": a})
        b["description"] = "B's stale edit"
        stale = client.put(url, json={"definition": b})
        print(f"save A={first.status_code}, stale save B={stale.status_code}, final title={client.get(url).json()['title']!r}")
        reviewed = client.get(url).json()["definition"]
        unreviewed = {**reviewed, "title": "Not reviewed"}
        client.put(url, json={"definition": unreviewed})
        published = client.post(f"{url}/publish")
        print(f"publish old review={published.status_code}, published title={published.json()['title']!r}")
finally:
    cleanup_tenant(tenant)
