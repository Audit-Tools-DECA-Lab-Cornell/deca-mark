from typing import TYPE_CHECKING

import anyio
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from fieldmaps_api.deps import user_transaction
from fieldmaps_api.observation_analysis_schemas import ObservationFilters
from fieldmaps_api.queries import observation_analysis as queries
from fieldmaps_api.repositories import observation_analysis as repository
from tests.local_database import admin_sql, database_url
from tests.observation_analysis_fixtures import AnalysisSite, seed_copies

if TYPE_CHECKING:
    from sqlalchemy import Result

pytest_plugins = ("tests.observation_analysis_fixtures",)


def test_query_plan_uses_bound_partial_indexes_when_zone_scope_is_selected(
    analysis_site: AnalysisSite,
) -> None:
    # Given 601 matches in one historical package/zone.
    seed_copies(analysis_site, 600)
    tenant = analysis_site.bound.site.tenant

    async def explain() -> str:
        engine = create_async_engine(database_url(), pool_size=2, max_overflow=0)
        try:
            sessions = async_sessionmaker(engine)
            async with user_transaction(sessions, tenant.users["manager"]) as session:
                parameters = repository.parameters(
                    tenant.project,
                    ObservationFilters(
                        site_id=tenant.site,
                        zone_id=(analysis_site.bound.zone,),
                        package_id=analysis_site.bound.package,
                    ),
                ) | {"cursor_time": None, "cursor_id": None, "limit": 101}
                result: Result[tuple[str]] = await session.execute(
                    text("EXPLAIN (ANALYZE, BUFFERS) " + queries.PAGE.text), parameters
                )
                return "\n".join(result.scalars())
        finally:
            await engine.dispose()

    # When the actual restricted-role page statement is explained.
    plan = anyio.run(explain)
    # Then the capture-binding partial index is usable and JSON rendering is bounded to a page.
    assert "observations_zone_time_idx" in plan or "observations_package_time_idx" in plan
    assert "Limit" in plan
    assert "rows=101" in plan


def test_export_snapshot_stays_consistent_when_late_write_commits_midstatement(
    analysis_site: AnalysisSite, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Given one bound row and an export statement waiting on a deterministic advisory lock.
    lock = 207_020
    statement = queries.EXPORT.text.replace(
        "WITH probe AS",
        f"WITH pause AS MATERIALIZED (SELECT pg_advisory_xact_lock({lock})), probe AS",
        1,
    )
    statement = statement.replace(
        "SELECT o.id FROM fieldmaps.observations o",
        "SELECT o.id FROM pause CROSS JOIN fieldmaps.observations o",
        1,
    )
    monkeypatch.setattr(queries, "EXPORT", text(statement))
    tenant = analysis_site.bound.site.tenant

    async def concurrent_export() -> tuple[int, int]:
        engine = create_async_engine(database_url(), pool_size=3, max_overflow=0)
        sessions = async_sessionmaker(engine)
        count = 0
        try:
            async with engine.begin() as holder:
                await holder.execute(text("SELECT pg_advisory_xact_lock(:lock)"), {"lock": lock})

                async def reader() -> None:
                    nonlocal count
                    async with user_transaction(sessions, tenant.users["manager"]) as session:
                        snapshot = await repository.export(
                            session,
                            tenant.project,
                            ObservationFilters(package_id=analysis_site.bound.package),
                            row_limit=10_000,
                            byte_limit=64 * 1024 * 1024,
                        )
                        count = snapshot.total_matching
                        assert len(snapshot.items) == count

                async with anyio.create_task_group() as group:
                    group.start_soon(reader)
                    with anyio.fail_after(5):
                        async with engine.connect() as observer:
                            while True:
                                waiting: Result[tuple[bool]] = await observer.execute(
                                    text("""
SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND objid=:lock AND NOT granted)
"""),
                                    {"lock": lock},
                                )
                                if waiting.scalar_one():
                                    break
                                await anyio.lowlevel.checkpoint()
                    await anyio.to_thread.run_sync(seed_copies, analysis_site, 1)
                    await holder.commit()
            async with user_transaction(sessions, tenant.users["manager"]) as session:
                after = await repository.export(
                    session,
                    tenant.project,
                    ObservationFilters(package_id=analysis_site.bound.package),
                    row_limit=10_000,
                    byte_limit=64 * 1024 * 1024,
                )
            return count, after.total_matching
        finally:
            await engine.dispose()

    # When a late observation commits while the first SQL snapshot is already active.
    counts = anyio.run(concurrent_export)
    # Then the first export remains wholly old and the next export sees the new row.
    assert counts == (1, 2)


def test_export_preflight_does_not_render_rows_when_raw_source_exceeds_64_mib(
    analysis_site: AnalysisSite, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Given a synthetic stored-answer scope exceeding the actual 64 MiB source ceiling.
    seed_copies(analysis_site, 300)
    tenant = analysis_site.bound.site.tenant
    admin_sql(
        "UPDATE fieldmaps.observations SET answers=jsonb_build_object("
        "'notes',repeat('x',262144)) WHERE project_id=:'project';",
        *tenant.variables(),
    )
    # A row-render sentinel would divide by zero if the expensive projection executes.
    statement = queries.EXPORT.text.replace(
        "'observation_id',o.id", "'observation_id',o.revision/(o.revision-o.revision)"
    )
    monkeypatch.setattr(queries, "EXPORT", text(statement))

    async def read() -> tuple[int, int, int]:
        engine = create_async_engine(database_url())
        try:
            async with user_transaction(
                async_sessionmaker(engine), tenant.users["manager"]
            ) as session:
                snapshot = await repository.export(
                    session,
                    tenant.project,
                    ObservationFilters(package_id=analysis_site.bound.package),
                    row_limit=10_000,
                    byte_limit=64 * 1024 * 1024,
                )
                result: Result[tuple[str]] = await session.execute(
                    text("EXPLAIN (ANALYZE, BUFFERS) " + statement),
                    repository.parameters(
                        tenant.project, ObservationFilters(package_id=analysis_site.bound.package)
                    )
                    | {"row_limit": 10_000, "row_probe": 10_001, "byte_limit": 64 * 1024 * 1024},
                )
                plan = "\n".join(result.scalars())
                assert "never executed" in plan
                return len(snapshot.items), snapshot.total_matching, snapshot.source_bytes
        finally:
            await engine.dispose()

    # When the restricted-role export statement preflights the raw payload.
    items, total, source = anyio.run(read)
    # Then no row JSON is rendered and a complete structured ceiling snapshot is returned.
    assert items == 0
    assert total == 301
    assert source > 64 * 1024 * 1024
