#!/bin/sh
# Explicit synthetic-only rehearsal of the deletion recovery forward migration.
set -eu
cd "$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"

unset DATABASE_URL DATABASE_PASSWORD DECAMARK_API_URL SUPABASE_URL SUPABASE_PUBLISHABLE_KEY
unset DECAMARK_TEST_DATABASE_URL DECAMARK_TEST_DATABASE_CONTAINER
unset DOCKER_CONTEXT DOCKER_TLS DOCKER_TLS_VERIFY DOCKER_CERT_PATH
export DOCKER_HOST=unix:///var/run/docker.sock
export EMAIL_ENABLED=false

audit_previous=b93a2b2456cf5d7dc96cfc2fc3eaf5174bc34f4c
audit_source=$(mktemp -d "$PWD/work/deletion-recovery/pre-schema.XXXXXX")
for audit_file in 20261012120000_current_baseline.sql 20261012142629_transactional_email_outbox.sql 20261017000657_observation_creator_visibility.sql 20261017050453_form_draft_revisions.sql; do
  git show "$audit_previous:supabase/migrations/$audit_file" > "$audit_source/$audit_file"
done
printf 'Pre-audit schema source: %s\n' "$audit_previous"
sha256sum "$audit_source/"*.sql

audit_container="fieldmaps-zone-api-$$"
audit_root=/var/lib/postgresql/audit-forward
audit_image=${DECAMARK_REHEARSAL_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.171}
audit_container_id=$(docker run --rm --pull never -d --name "$audit_container" --user postgres \
  --tmpfs /tmp -p 127.0.0.1::5432 --entrypoint sh "$audit_image" -c \
  'initdb -D /tmp/audit-db -A trust >/tmp/init.log && printf "host all all 0.0.0.0/0 trust\n" >> /tmp/audit-db/pg_hba.conf && exec postgres -D /tmp/audit-db -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c listen_addresses=* -k /tmp')
cleanup() {
  docker stop "$audit_container_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
audit_attempt=0
until docker exec "$audit_container" pg_isready -h /tmp -U postgres >/dev/null 2>&1; do
  audit_attempt=$((audit_attempt + 1))
  if [ "$audit_attempt" -ge 30 ]; then
    docker logs "$audit_container"
    exit 1
  fi
  sleep 1
done
audit_psql() {
  docker exec "$audit_container" psql -h /tmp -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}
docker exec "$audit_container" mkdir -p "$audit_root/database" "$audit_root/migrations"
docker cp database/tests/zone-bootstrap.sql "$audit_container:$audit_root/database/zone-bootstrap.sql"
docker cp "$audit_source/." "$audit_container:$audit_root/migrations/"
docker cp supabase/seed.sql "$audit_container:$audit_root/seed.sql"
docker exec --user root "$audit_container" chmod -R a+rX "$audit_root"
audit_psql -f "$audit_root/database/zone-bootstrap.sql"
for audit_file in 20261012120000_current_baseline.sql 20261012142629_transactional_email_outbox.sql 20261017000657_observation_creator_visibility.sql 20261017050453_form_draft_revisions.sql; do
  audit_psql --single-transaction -f "$audit_root/migrations/$audit_file" >/dev/null
done
audit_psql -f "$audit_root/seed.sql"
audit_port=$(docker port "$audit_container" 5432/tcp | sed 's/127.0.0.1://')
export DECAMARK_TEST_DATABASE_CONTAINER="$audit_container"
export DECAMARK_TEST_DATABASE_URL="postgresql+asyncpg://fieldmaps_api@127.0.0.1:$audit_port/postgres"
audit_test="$PWD/database/tests/test_deletion_recovery_migration.py"
cd backend
./.venv/bin/python -m pytest -c pyproject.toml "$audit_test" "$@"
