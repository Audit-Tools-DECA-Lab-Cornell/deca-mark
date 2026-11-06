from datetime import datetime
from uuid import uuid4

import pytest

from fieldmaps_api.observation_analysis_schemas import HistoricalObservationDetail, ObservationPage
from tests.bound_upload_fixtures import BoundSite
from tests.local_database import admin_sql
from tests.test_observation_analysis_exports import files
from tests.test_zone_api_live import LiveApi
from tests.zone_api_fixtures import document

pytestmark = pytest.mark.integration
pytest_plugins = ("tests.bound_upload_live_fixtures",)


@pytest.mark.parametrize("started_at", [None, "2026-10-10T11:59:00Z"])
def test_loopback_upload_stores_both_instants_and_replays(
    live_api: LiveApi, live_bound_site: BoundSite, started_at: str | None
) -> None:
    observation = uuid4()
    url = live_bound_site.url(observation)
    payload = live_bound_site.point()
    if started_at is not None:
        payload["started_at"] = started_at
    with live_api.client("observer") as collector:
        first = collector.put(url, json=payload)
        replay = collector.put(url, json=payload)
        assert first.status_code == 200, first.text
        assert replay.content == first.content, replay.text
        response = collector.get(url)
        assert response.status_code == 200, response.text
        detail = HistoricalObservationDetail.model_validate_json(response.content)
        assert detail.started_at == (
            None if started_at is None else datetime.fromisoformat(started_at)
        )
        assert detail.observed_at == datetime.fromisoformat(str(payload["observed_at"]))
        assert "started_at" in document(response.content)
        page = collector.get(
            f"/v1/projects/{live_bound_site.site.tenant.project}/observations",
            params={"package_id": str(live_bound_site.package)},
        )
        assert page.status_code == 200, page.text
        rows = ObservationPage.model_validate_json(page.content).items
        assert rows[0].started_at == detail.started_at
        if started_at is not None:
            conflict = collector.put(url, json=payload | {"started_at": "2026-10-10T11:58:00Z"})
            assert conflict.status_code == 409, conflict.text
    with live_api.client() as manager:
        for format_name in ("csv", "geojson"):
            exported = manager.get(
                f"/v1/projects/{live_bound_site.site.tenant.project}/observations/export",
                params={"format": format_name, "package_id": str(live_bound_site.package)},
            )
            assert exported.status_code == 200, exported.text
            assets = files(exported.content)
            assert b"started_at" not in assets[f"observations.{format_name}"]
    stored = admin_sql(
        "SELECT (started_at IS NULL)::text FROM fieldmaps.observations WHERE id=:'id';",
        f"id={observation}",
    )
    assert stored == str(started_at is None).lower()
    admin_sql(
        "SELECT set_config('test.observation', :'id', false); "
        "DO $$ BEGIN BEGIN UPDATE fieldmaps.observations "
        "SET started_at='2026-10-10T11:57:00Z' WHERE id=current_setting('test.observation')::uuid; "
        "RAISE EXCEPTION 'Start was mutable'; "
        "EXCEPTION WHEN check_violation THEN NULL; END; END $$;",
        f"id={observation}",
    )
