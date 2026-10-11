\set ON_ERROR_STOP on
CREATE SCHEMA extensions;
CREATE SCHEMA auth;
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE ROLE supabase_auth_admin;
CREATE ROLE supabase_admin SUPERUSER;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  instance_id uuid,
  aud text,
  role text,
  email text,
  email_confirmed_at timestamptz
);
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
