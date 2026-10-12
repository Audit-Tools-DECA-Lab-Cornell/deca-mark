-- Backend-only queue: never exposed through Supabase Data API or browser roles.
CREATE TABLE fieldmaps_private.email_outbox (
  id uuid PRIMARY KEY,
  created_by uuid NOT NULL,
  project_id uuid,
  invitation_id uuid,
  recipient_user_id uuid,
  kind text NOT NULL CHECK (kind IN ('invitation','reminder','notification')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','cancelled')),
  recipient text NOT NULL,
  subject text NOT NULL,
  html text NOT NULL,
  plain_text text NOT NULL,
  dedupe_key uuid NOT NULL,
  fingerprint text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_attempt_at timestamptz,
  lease uuid,
  lease_until timestamptz,
  last_error text,
  message_id text,
  sent_at timestamptz,
  UNIQUE (created_by, dedupe_key),
  CHECK (isfinite(scheduled_at) AND isfinite(expires_at) AND expires_at > scheduled_at)
);
CREATE INDEX email_outbox_due_idx ON fieldmaps_private.email_outbox (available_at, id)
  WHERE status = 'queued';
CREATE INDEX email_outbox_lease_idx ON fieldmaps_private.email_outbox (lease_until)
  WHERE status = 'sending';
-- Expiration cleanup only visits rows that still contain private payload data.
CREATE INDEX email_outbox_expired_payload_idx ON fieldmaps_private.email_outbox (expires_at)
  WHERE recipient <> '';
CREATE INDEX email_outbox_project_idx ON fieldmaps_private.email_outbox (project_id, created_at DESC);
ALTER TABLE fieldmaps_private.email_outbox ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fieldmaps_private.email_outbox FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON fieldmaps_private.email_outbox TO fieldmaps_api;
-- fieldmaps_api is the trusted server role. Tenant access is checked by API routes;
-- workers need to claim across tenants without impersonating a browser user.
CREATE POLICY backend_delivery ON fieldmaps_private.email_outbox
  TO fieldmaps_api USING (true) WITH CHECK (true);

-- auth.users must remain inaccessible to the API role. This narrow, private lookup
-- requires a real manager and returns only a verified active collaborator's address.
CREATE FUNCTION fieldmaps_private.email_recipient(p_project uuid, p_recipient uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = '' AS $$
DECLARE address text;
BEGIN
  IF fieldmaps.request_user_id() IS NULL OR NOT fieldmaps_private.has_project_role(
      p_project, ARRAY['manager']) THEN
    RETURN NULL;
  END IF;
  SELECT lower(u.email) INTO address FROM auth.users u
    JOIN fieldmaps.profiles profile ON profile.user_id = u.id AND profile.deleted_at IS NULL
    JOIN fieldmaps.projects project ON project.id = p_project AND project.status = 'active'
    JOIN fieldmaps.organizations org ON org.id = project.organization_id AND org.deleted_at IS NULL
    WHERE u.id = p_recipient AND u.email_confirmed_at IS NOT NULL AND u.email IS NOT NULL
    AND (EXISTS (SELECT FROM fieldmaps.project_memberships m
      WHERE m.project_id = p_project AND m.user_id = p_recipient)
      OR EXISTS (SELECT FROM fieldmaps.organization_members m
      WHERE m.organization_id = project.organization_id AND m.user_id = p_recipient
        AND m.role IN ('owner','admin')));
  RETURN address;
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.email_recipient(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION fieldmaps_private.email_recipient(uuid, uuid) TO fieldmaps_api;
