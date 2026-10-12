-- Privileged synthetic fixtures for tenancy/constraint tests. Runtime writes use the
-- finalizer tested in zone-publication.sql; this helper never grants API writes.
CREATE FUNCTION pg_temp.fixture_package(p_site uuid, p_package uuid, p_zone uuid,
  p_form uuid, p_inventory uuid DEFAULT NULL, p_version integer DEFAULT 1,
  p_zones jsonb DEFAULT NULL, p_boundary jsonb DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE s fieldmaps.sites; z jsonb; geometry jsonb; anchor extensions.geometry; geom extensions.geometry;
  digest text; manifest_zones jsonb := '[]'; play_code text; inventory_code text;
BEGIN
  SELECT * INTO STRICT s FROM fieldmaps.sites WHERE id=p_site;
  SELECT code INTO STRICT play_code FROM fieldmaps.form_versions WHERE id=p_form;
  SELECT code INTO inventory_code FROM fieldmaps.form_versions WHERE id=p_inventory;
  p_boundary := coalesce(p_boundary,'{"type":"MultiPolygon","coordinates":[[[[-76.9,42],[-76,42],[-76,43],[-76.9,43],[-76.9,42]]]]}');
  p_zones := coalesce(p_zones,jsonb_build_array(jsonb_build_object('zone_id',p_zone,'zone_code','FIXTURE',
    'zone_label','Synthetic current zone','geometry',p_boundary)));
  FOR z IN SELECT jsonb_array_elements(p_zones) LOOP
    geometry := fieldmaps_private.normalize_zone_geometry(z->'geometry');
    geom := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry),4326);
    anchor := extensions.ST_PointOnSurface(geom);
    digest := fieldmaps_private.zone_geometry_digest(geometry);
    manifest_zones := manifest_zones || jsonb_build_array(jsonb_build_object('zone_id',z->'zone_id',
      'zone_code',z->'zone_code','label',z->'zone_label',
      'bbox',jsonb_build_array(extensions.ST_XMin(geom::extensions.box3d),extensions.ST_YMin(geom::extensions.box3d),
        extensions.ST_XMax(geom::extensions.box3d),extensions.ST_YMax(geom::extensions.box3d)),
      'display_anchor',extensions.ST_AsGeoJSON(anchor,17)::jsonb->'coordinates','geometry_sha256',digest));
  END LOOP;
  INSERT INTO fieldmaps.site_packages(id,organization_id,project_id,site_id,form_version_id,
    inventory_form_version_id,version,state,manifest,archive,archive_sha256,prepared_by,site_boundary)
  VALUES(p_package,s.organization_id,s.project_id,p_site,p_form,p_inventory,p_version,'ready',
    jsonb_build_object('format',1,'site_id',p_site,'site_code',s.code,'package_id',p_package,'package_version',p_version,
      'forms',jsonb_build_object('play',jsonb_build_object('form_version_id',p_form,'form_version',play_code),
        'inventory',CASE WHEN p_inventory IS NULL THEN NULL ELSE jsonb_build_object('form_version_id',p_inventory,'form_version',inventory_code) END),
      'zones',manifest_zones),'\x0102',encode(sha256('\x0102'::bytea),'hex'),
    '50000000-0000-4000-8000-000000000004',extensions.ST_Multi(extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(p_boundary),4326)));
  FOR z IN SELECT jsonb_array_elements(p_zones) LOOP
    geometry := fieldmaps_private.normalize_zone_geometry(z->'geometry');
    geom := extensions.ST_SetSRID(extensions.ST_GeomFromGeoJSON(geometry),4326);
    INSERT INTO fieldmaps.zone_identities(id,organization_id,project_id,site_id,code,created_by)
      VALUES((z->>'zone_id')::uuid,s.organization_id,s.project_id,p_site,z->>'zone_code',
        '50000000-0000-4000-8000-000000000004') ON CONFLICT(id) DO NOTHING;
    INSERT INTO fieldmaps.package_zones(organization_id,project_id,site_id,package_id,zone_id,label,geom,display_anchor,geometry_sha256,canonical_geometry)
      VALUES(s.organization_id,s.project_id,p_site,p_package,(z->>'zone_id')::uuid,z->>'zone_label',geom,
        extensions.ST_PointOnSurface(geom),fieldmaps_private.zone_geometry_digest(geometry),geometry);
  END LOOP;
  INSERT INTO fieldmaps.zone_publications(request_id,created_by,organization_id,project_id,site_id,operation,
    expected_current_package_id,request_hash,request,published_package_id,identity_map,change_note)
  VALUES(p_package,'50000000-0000-4000-8000-000000000004',s.organization_id,s.project_id,p_site,'package_import',
    (SELECT current_package_id FROM fieldmaps.site_zone_state WHERE site_id=p_site),repeat('a',64),'{}',p_package,p_zones,'Synthetic fixture');
  INSERT INTO fieldmaps.site_zone_state(site_id,organization_id,project_id,current_package_id,revision)
    VALUES(p_site,s.organization_id,s.project_id,p_package,p_version)
    ON CONFLICT(site_id) DO UPDATE SET current_package_id=excluded.current_package_id,revision=excluded.revision;
END;
$$;
