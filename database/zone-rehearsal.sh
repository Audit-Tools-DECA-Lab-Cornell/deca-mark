#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

zone_container="fieldmaps-zone-rehearsal-$$"
zone_root=/var/lib/postgresql/zone-tests
zone_image=public.ecr.aws/supabase/postgres:17.6.1.171

cleanup() {
  docker stop "$zone_container_id" >/dev/null 2>&1 || true
}

zone_container_id=$(docker run --rm --pull never -d --name "$zone_container" --user postgres --tmpfs /tmp \
  --entrypoint sh "$zone_image" -c \
  'initdb -D /tmp/zone-db -A trust >/tmp/init.log && exec postgres -D /tmp/zone-db -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c listen_addresses= -k /tmp')
trap cleanup EXIT HUP INT TERM

zone_attempt=0
until docker exec "$zone_container" pg_isready -h /tmp -U postgres >/dev/null 2>&1; do
  zone_attempt=$((zone_attempt + 1))
  if [ "$zone_attempt" -ge 30 ]; then
    docker logs "$zone_container"
    exit 1
  fi
  sleep 1
done

zone_psql() {
  docker exec "$zone_container" psql -h /tmp -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

docker exec "$zone_container" mkdir -p "$zone_root/database" "$zone_root/supabase"
docker exec "$zone_container" ln -s "$zone_root" /tmp/fieldmaps-tests
docker cp database/tests "$zone_container:$zone_root/database/"
docker cp supabase/migrations "$zone_container:$zone_root/supabase/"
docker cp supabase/seed.sql "$zone_container:$zone_root/supabase/seed.sql"
docker cp database/hosted/verify.sql "$zone_container:$zone_root/database/verify.sql"
docker cp contracts/forms/janet-test-v1.json "$zone_container:$zone_root/janet-test-v1.json"
docker cp contracts/zones/geometry.cases.json "$zone_container:$zone_root/zone-geometry.cases.json"

zone_psql -f "$zone_root/database/tests/zone-bootstrap.sql"
for zone_migration in supabase/migrations/*.sql; do
  zone_name=$(basename "$zone_migration")
  if [ "$zone_name" = 20261010120000_zone_foundation.sql ]; then
    zone_psql --single-transaction -f "$zone_root/database/tests/zone-legacy-fixtures.sql"
  fi
  zone_psql --single-transaction -f "$zone_root/supabase/migrations/$zone_name" >/dev/null
done

zone_psql -f "$zone_root/database/tests/zone-legacy-preservation.sql"
zone_psql -f "$zone_root/database/tests/run.sql"
zone_psql -f "$zone_root/database/tests/auth_hooks.sql"
zone_psql -f "$zone_root/database/verify.sql"
node database/tests/zone-numbers.mjs "$zone_container"
node database/tests/zone-concurrency.mjs "$zone_container"
zone_psql -f "$zone_root/database/tests/zone-legacy-history.sql"
printf '%s\n' 'Zone migration rehearsal passed on disposable PostgreSQL 17/PostGIS; existing databases untouched.'
