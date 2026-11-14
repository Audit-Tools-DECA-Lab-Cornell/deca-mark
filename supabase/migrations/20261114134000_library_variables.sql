-- DB-21: storage and read grants only. Provisional content belongs to local seed.sql.
CREATE TABLE fieldmaps.library_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('universal','organization','project','site')),
  organization_id uuid REFERENCES fieldmaps.organizations(id) ON DELETE RESTRICT,
  project_id uuid,
  site_id uuid,
  code text NOT NULL CHECK (code ~ '^[A-Za-z][A-Za-z0-9_-]{0,99}$'),
  group_name text NOT NULL CHECK (length(btrim(group_name)) BETWEEN 1 AND 100),
  section text NOT NULL CHECK (section IN ('Child','Social','Play','Setting','Climate','Inventory','Record')),
  settings jsonb NOT NULL CHECK (jsonb_typeof(settings) = 'object' AND octet_length(settings::text) <= 32768),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 9007199254740991),
  created_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(created_at)),
  updated_at timestamptz NOT NULL DEFAULT now() CHECK (isfinite(updated_at)),
  FOREIGN KEY (organization_id,project_id) REFERENCES fieldmaps.projects(organization_id,id) ON DELETE RESTRICT,
  FOREIGN KEY (organization_id,project_id,site_id) REFERENCES fieldmaps.sites(organization_id,project_id,id) ON DELETE RESTRICT,
  CONSTRAINT library_variables_scope CHECK (
    (level='universal' AND organization_id IS NULL AND project_id IS NULL AND site_id IS NULL) OR
    (level='organization' AND organization_id IS NOT NULL AND project_id IS NULL AND site_id IS NULL) OR
    (level='project' AND organization_id IS NOT NULL AND project_id IS NOT NULL AND site_id IS NULL) OR
    (level='site' AND organization_id IS NOT NULL AND project_id IS NOT NULL AND site_id IS NOT NULL))
);
CREATE UNIQUE INDEX library_universal_code ON fieldmaps.library_variables(code) WHERE level='universal';
CREATE UNIQUE INDEX library_org_code ON fieldmaps.library_variables(organization_id,code) WHERE level='organization';
CREATE UNIQUE INDEX library_project_code ON fieldmaps.library_variables(project_id,code) WHERE level='project';
CREATE UNIQUE INDEX library_site_code ON fieldmaps.library_variables(site_id,code) WHERE level='site';
CREATE INDEX library_org_scope ON fieldmaps.library_variables(organization_id,level);
CREATE INDEX library_project_scope ON fieldmaps.library_variables(project_id,level,site_id);
ALTER TABLE fieldmaps.library_variables ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fieldmaps.library_variables FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
GRANT SELECT ON fieldmaps.library_variables TO fieldmaps_api;
CREATE POLICY library_read ON fieldmaps.library_variables FOR SELECT TO fieldmaps_api USING (
  (level='universal' AND (SELECT
    EXISTS (SELECT FROM fieldmaps.organizations o WHERE fieldmaps_private.has_org_role(o.id,ARRAY['owner','admin'])) OR
    EXISTS (SELECT FROM fieldmaps.projects p WHERE fieldmaps_private.has_project_role(p.id,ARRAY['viewer','manager'])))) OR
  (level='organization' AND organization_id IN (
    SELECT o.id FROM fieldmaps.organizations o WHERE fieldmaps_private.has_org_role(o.id,ARRAY['owner','admin'])
    UNION SELECT p.organization_id FROM fieldmaps.projects p WHERE fieldmaps_private.has_project_role(p.id,ARRAY['viewer','manager']))) OR
  (level IN ('project','site') AND project_id IN (
    SELECT p.id FROM fieldmaps.projects p WHERE fieldmaps_private.has_project_role(p.id,ARRAY['viewer','manager'])))
);
-- No API write grant, function or policy. DB-23 remains under owner review.
