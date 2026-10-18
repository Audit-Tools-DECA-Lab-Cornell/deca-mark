-- A tombstone and its recoverable external deletion commit or roll back together.
CREATE TABLE fieldmaps_private.account_deletions (
    user_id uuid PRIMARY KEY REFERENCES fieldmaps.profiles(user_id) ON DELETE CASCADE,
    requested_at timestamptz NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 1001),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_attempt_at timestamptz,
    last_error text CHECK (last_error IN ('provider_unavailable','permission','configuration')),
    lease_token uuid,
    lease_until timestamptz,
    CHECK ((lease_token IS NULL) = (lease_until IS NULL))
);
CREATE INDEX account_deletions_due ON fieldmaps_private.account_deletions(next_attempt_at,user_id);
ALTER TABLE fieldmaps_private.account_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fieldmaps_private.account_deletions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON fieldmaps_private.account_deletions TO fieldmaps_api;
GRANT UPDATE(attempts,next_attempt_at,last_attempt_at,last_error,lease_token,lease_until)
    ON fieldmaps_private.account_deletions TO fieldmaps_api;
-- Like email delivery, the trusted backend worker claims independently of end-user JWTs.
CREATE POLICY backend_deletion ON fieldmaps_private.account_deletions
    TO fieldmaps_api USING (true) WITH CHECK (true);

CREATE FUNCTION fieldmaps_private.enqueue_account_deletion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
    IF NEW.deleted_at IS NOT NULL THEN
        INSERT INTO fieldmaps_private.account_deletions(user_id,requested_at)
        VALUES (NEW.user_id,NEW.deleted_at) ON CONFLICT (user_id) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION fieldmaps_private.enqueue_account_deletion()
    FROM PUBLIC, anon, authenticated, service_role, fieldmaps_api;
CREATE TRIGGER enqueue_account_deletion
    AFTER INSERT OR UPDATE OF deleted_at ON fieldmaps.profiles
    FOR EACH ROW EXECUTE FUNCTION fieldmaps_private.enqueue_account_deletion();

-- Recover tombstones committed by previous API versions as well as new requests.
INSERT INTO fieldmaps_private.account_deletions(user_id,requested_at)
SELECT user_id,deleted_at FROM fieldmaps.profiles WHERE deleted_at IS NOT NULL;

INSERT INTO fieldmaps_meta.schema_migrations(version) VALUES ('20261018030756');
