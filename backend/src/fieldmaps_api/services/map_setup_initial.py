"""Carry the current site's boundaries and identities into replacement setup."""

from uuid import UUID

from sqlalchemy import Result, text
from sqlalchemy.ext.asyncio import AsyncSession

from fieldmaps_api.map_setup_schemas import MapSetupReplace
from fieldmaps_api.services import zones


async def initial_content(
    session: AsyncSession, project: UUID, site: UUID, current: UUID | None
) -> MapSetupReplace:
    if current is None:
        return MapSetupReplace(import_generation=1)
    historical = await zones.historical(session, project, site, current)
    result: Result[tuple[str]] = await session.execute(
        text("""
        SELECT jsonb_build_object('import_generation',1,
            'outline',extensions.ST_AsGeoJSON(k.site_boundary)::jsonb,
            'form_version',f.code,'inventory_form_version',i.code)::text
        FROM fieldmaps.site_packages k JOIN fieldmaps.form_versions f ON f.id=k.form_version_id
        LEFT JOIN fieldmaps.form_versions i ON i.id=k.inventory_form_version_id
        WHERE k.id=:package AND k.project_id=:project AND k.site_id=:site
    """),
        {"package": current, "project": project, "site": site},
    )
    content = MapSetupReplace.model_validate_json(result.scalar_one())
    return MapSetupReplace.model_validate(
        {
            **content.model_dump(mode="json"),
            "zones": [
                {
                    "zone_id": z.zone_id,
                    "zone_code": z.zone_code,
                    "zone_label": z.zone_label,
                    "geometry": z.geometry.model_dump(),
                }
                for z in historical.zones
            ],
        }
    )
