#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

case "${1:-test}" in
  test|--reset-only) baseline_mode="${1:-test}" ;;
  *) printf '%s\n' 'Usage: sh database/baseline-rehearsal.sh [test|--reset-only]' >&2; exit 2 ;;
esac

baseline_container="decamark-baseline-$$"
baseline_root=/var/lib/postgresql/baseline-tests
baseline_image=${DECAMARK_REHEARSAL_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.171}
baseline_container_id=$(docker run --rm --pull never -d --name "$baseline_container" --user postgres \
  --tmpfs /tmp --entrypoint sh "$baseline_image" -c \
  'initdb -D /tmp/baseline-db -A trust >/tmp/init.log && exec postgres -D /tmp/baseline-db -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c listen_addresses= -k /tmp')
cleanup() {
  docker stop "$baseline_container_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM
baseline_attempt=0
until docker exec "$baseline_container" pg_isready -h /tmp -U postgres >/dev/null 2>&1; do
  baseline_attempt=$((baseline_attempt + 1))
  if [ "$baseline_attempt" -ge 30 ]; then
    docker logs "$baseline_container"
    exit 1
  fi
  sleep 1
done
baseline_psql() {
  docker exec "$baseline_container" psql -h /tmp -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}
docker exec "$baseline_container" mkdir -p "$baseline_root/database/hosted" "$baseline_root/supabase"
docker exec "$baseline_container" ln -s "$baseline_root" /tmp/fieldmaps-tests
docker cp database/tests "$baseline_container:$baseline_root/database/"
docker cp supabase/migrations "$baseline_container:$baseline_root/supabase/"
docker cp supabase/seed.sql "$baseline_container:$baseline_root/supabase/seed.sql"
docker cp database/hosted/verify.sql "$baseline_container:$baseline_root/database/hosted/verify.sql"
docker cp contracts/forms/janet-test-v1.json "$baseline_container:$baseline_root/janet-test-v1.json"
docker cp contracts/forms/janet-inventory-v1.json "$baseline_container:$baseline_root/janet-inventory-v1.json"
docker cp contracts/forms/definition.cases.json "$baseline_container:$baseline_root/form-definition.cases.json"
docker cp contracts/form-definition.schema.json "$baseline_container:$baseline_root/form-definition.schema.json"
docker cp contracts/zones/geometry.cases.json "$baseline_container:$baseline_root/zone-geometry.cases.json"
docker cp contracts/zones/publication.cases.json "$baseline_container:$baseline_root/zone-publication.cases.json"
docker cp contracts/zones/upload.cases.json "$baseline_container:$baseline_root/zone-upload.cases.json"
# docker cp retains restrictive checkout modes; these are public synthetic fixtures only.
docker exec --user root "$baseline_container" chmod -R a+rX "$baseline_root"
baseline_psql -f "$baseline_root/database/tests/zone-bootstrap.sql"
# Start from the canonical baseline, then apply subsequent current feature migrations.
set -- supabase/migrations/*.sql
if [ ! -f "$1" ] || [ "$(basename "$1")" != '20261012120000_current_baseline.sql' ]; then
  printf '%s\n' 'Expected the current schema baseline as the first migration.' >&2
  exit 1
fi
baseline_psql -c "CREATE SCHEMA IF NOT EXISTS supabase_migrations;
CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations
(version text PRIMARY KEY, statements text[], name text);" >/dev/null
for baseline_migration in "$@"; do
  baseline_name=$(basename "$baseline_migration")
  if [ "$baseline_name" = '20261024090000_form_schema2.sql' ]; then
    # Genuine all-row Python validation, report and history are one explicit local operation.
    sh database/form-schema2.sh apply-local "$baseline_container"
  else
    baseline_psql --single-transaction -f "$baseline_root/supabase/migrations/$baseline_name" >/dev/null
    baseline_version=${baseline_name%%_*}
    baseline_psql -c "INSERT INTO supabase_migrations.schema_migrations(version,name,statements)
      VALUES ('$baseline_version','$baseline_name',ARRAY[]::text[]);" >/dev/null
  fi
done
baseline_psql -f "$baseline_root/supabase/seed.sql"
if [ "$baseline_mode" = '--reset-only' ]; then
  printf '%s\n' 'Fresh baseline and seeds built on disposable PostgreSQL 17/PostGIS; existing databases untouched.'
  exit 0
fi
baseline_psql -f "$baseline_root/database/tests/run.sql"
baseline_psql -f "$baseline_root/database/tests/auth_hooks.sql"
baseline_psql -f "$baseline_root/database/hosted/verify.sql"
node database/tests/zone-numbers.mjs "$baseline_container"
node database/tests/zone-concurrency.mjs "$baseline_container"
printf '%s\n' 'Current schema acceptance passed on disposable PostgreSQL 17/PostGIS; existing databases untouched.'
