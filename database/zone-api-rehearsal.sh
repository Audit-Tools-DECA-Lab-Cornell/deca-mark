#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

zone_container="fieldmaps-zone-api-$$"
zone_root=/var/lib/postgresql/zone-tests
zone_image=${DECAMARK_REHEARSAL_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.171}
zone_container_id=$(docker run --rm --pull never -d --name "$zone_container" --user postgres \
  --tmpfs /tmp -p 127.0.0.1::5432 --entrypoint sh "$zone_image" -c \
  'initdb -D /tmp/zone-db -A trust >/tmp/init.log && printf "host all all 0.0.0.0/0 trust\n" >> /tmp/zone-db/pg_hba.conf && exec postgres -D /tmp/zone-db -c shared_preload_libraries=pg_cron -c cron.database_name=postgres -c listen_addresses=* -k /tmp')
cleanup() {
  docker stop "$zone_container_id" >/dev/null 2>&1 || true
}
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
docker cp contracts/forms/janet-test-v1.json "$zone_container:$zone_root/janet-test-v1.json"
docker cp contracts/zones/geometry.cases.json "$zone_container:$zone_root/zone-geometry.cases.json"
# docker cp retains restrictive checkout modes; these are public synthetic fixtures only.
docker exec --user root "$zone_container" chmod -R a+rX "$zone_root"
zone_psql -f "$zone_root/database/tests/zone-bootstrap.sql"
for zone_migration in supabase/migrations/*.sql; do
  zone_name=$(basename "$zone_migration")
  zone_psql --single-transaction -f "$zone_root/supabase/migrations/$zone_name" >/dev/null
done
zone_psql -f "$zone_root/supabase/seed.sql"
zone_port=$(docker port "$zone_container" 5432/tcp | sed 's/127.0.0.1://')
export DECAMARK_TEST_DATABASE_CONTAINER="$zone_container"
export DECAMARK_TEST_DATABASE_URL="postgresql+asyncpg://fieldmaps_api@127.0.0.1:$zone_port/postgres"
cd backend
exec_test=./.venv/bin/python
"$exec_test" -m pytest "$@"
