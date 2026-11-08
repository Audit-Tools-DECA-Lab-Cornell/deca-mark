/**
 * The collector schema at `user_version` 6 as 4eaf103 created it, before MOB-42 (490567b) stopped
 * creating `active_sessions` and `package_selections` without changing the version. A device that
 * reached version 6 in that window still holds both. Test-only.
 */
export const preMob42SchemaV6 = `
  CREATE TABLE observations (
    id TEXT PRIMARY KEY NOT NULL, created_at TEXT NOT NULL, payload TEXT NOT NULL,
    owner_scope TEXT NOT NULL DEFAULT 'local',
    sync_state TEXT NOT NULL DEFAULT 'local-only'
      CHECK (sync_state IN ('local-only', 'pending', 'synced', 'needs-attention')),
    sync_error TEXT NOT NULL DEFAULT '', server_receipt TEXT NOT NULL DEFAULT '',
    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    package_key TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX observations_created_at ON observations(created_at DESC);
  CREATE INDEX observations_pending ON observations(owner_scope, sync_state, next_attempt_at);
  CREATE INDEX observations_package_reference ON observations(package_key);
  CREATE TABLE observation_drafts (
    owner_scope TEXT PRIMARY KEY NOT NULL, id TEXT NOT NULL,
    updated_at TEXT NOT NULL, payload TEXT NOT NULL, package_key TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX drafts_package_reference ON observation_drafts(package_key);
  CREATE TABLE parked_observation_drafts (
    owner_scope TEXT NOT NULL, id TEXT NOT NULL, updated_at TEXT NOT NULL,
    payload TEXT NOT NULL, package_key TEXT NOT NULL DEFAULT '', PRIMARY KEY(owner_scope,id)
  );
  CREATE INDEX parked_drafts_package_reference ON parked_observation_drafts(package_key);
  CREATE TABLE package_contents (
    content_key TEXT PRIMARY KEY NOT NULL, issuer TEXT NOT NULL, project_id TEXT NOT NULL,
    site_id TEXT NOT NULL, package_id TEXT NOT NULL, digest TEXT NOT NULL, payload TEXT NOT NULL,
    UNIQUE(issuer, project_id, package_id)
  );
  CREATE TABLE package_authorizations (
    owner_scope TEXT NOT NULL, content_key TEXT NOT NULL,
    PRIMARY KEY(owner_scope, content_key)
  );
  CREATE TABLE package_selections (
    owner_scope TEXT NOT NULL, project_id TEXT NOT NULL, site_id TEXT NOT NULL,
    content_key TEXT NOT NULL, PRIMARY KEY(owner_scope, project_id, site_id)
  );
  CREATE TABLE available_current_packages (
    owner_scope TEXT NOT NULL, project_id TEXT NOT NULL, site_id TEXT NOT NULL,
    payload TEXT NOT NULL, PRIMARY KEY(owner_scope, project_id, site_id)
  );
  CREATE TABLE active_sessions (
    owner_scope TEXT PRIMARY KEY NOT NULL, package_key TEXT NOT NULL, payload TEXT NOT NULL
  );
  CREATE TABLE local_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
`;
