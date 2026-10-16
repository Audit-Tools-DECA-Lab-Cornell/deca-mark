#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

supabase_cli() {
  pnpm dlx supabase@2.118.0 "$@"
}

local_psql() {
  docker exec -i supabase_db_field-maps psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"
}

# The Docker daemon restarts this stack's containers by itself when it starts (restart: unless-stopped), so right
# after Docker comes up the database container can be running but not ready. In that state `supabase start` does
# not wait: it answers StatusDbNotReadyError ("container is not ready: starting") and exits 1. Wait for the
# container's own health check instead, while it is running and still starting (at most two minutes).
wait_for_database() {
  i=0
  while [ "$(docker inspect --format '{{.State.Running}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' \
    supabase_db_field-maps 2>/dev/null)" = 'true starting' ]; do
    i=$((i + 1))
    if [ "$i" -gt 120 ]; then
      printf '%s\n' 'The local database container is still starting after two minutes; see docker logs supabase_db_field-maps.' >&2
      return 1
    fi
    sleep 1
  done
}

configure_api() {
  mkdir -p database/.local
  chmod 700 database/.local
  if [ ! -f database/.local/fieldmaps-api-password ]; then
    (umask 077; openssl rand -hex 32 > database/.local/fieldmaps-api-password)
  fi
  chmod 600 database/.local/fieldmaps-api-password
  task_password=$(cat database/.local/fieldmaps-api-password)
  printf "ALTER ROLE fieldmaps_api PASSWORD '%s';\n" "$task_password" | local_psql >/dev/null
}

case "${1:-help}" in
  start)
    wait_for_database
    # The CLI prints its status (with the local keys) on success and its error on failure, both on stdout:
    # keep the first quiet, and show the second.
    if ! started=$(supabase_cli start); then
      printf '%s\n' "$started" >&2
      exit 1
    fi
    configure_api
    printf '%s\n' 'Local Supabase ready. Studio: http://127.0.0.1:54323; Mailpit: http://127.0.0.1:54324'
    ;;
  stop) supabase_cli stop ;;
  reset)
    if [ "$#" -eq 2 ] && [ "$2" = '--disposable' ]; then
      exec sh database/baseline-rehearsal.sh --reset-only
    fi
    if [ "$#" -ne 1 ]; then
      printf '%s\n' 'Use reset or reset --disposable.' >&2
      exit 2
    fi
    supabase_cli db reset --local --yes >/dev/null
    configure_api
    ;;
  test)
    docker exec supabase_db_field-maps mkdir -p /tmp/fieldmaps-tests/supabase /tmp/fieldmaps-tests/database/hosted
    docker cp database/tests supabase_db_field-maps:/tmp/fieldmaps-tests/database/
    docker cp supabase/seed.sql supabase_db_field-maps:/tmp/fieldmaps-tests/supabase/seed.sql
    docker cp contracts/forms/janet-test-v1.json supabase_db_field-maps:/tmp/fieldmaps-tests/janet-test-v1.json
    docker cp contracts/zones/geometry.cases.json supabase_db_field-maps:/tmp/fieldmaps-tests/zone-geometry.cases.json
    docker cp contracts/zones/publication.cases.json supabase_db_field-maps:/tmp/fieldmaps-tests/zone-publication.cases.json
    docker cp contracts/zones/upload.cases.json supabase_db_field-maps:/tmp/fieldmaps-tests/zone-upload.cases.json
    docker cp database/hosted/verify.sql supabase_db_field-maps:/tmp/fieldmaps-tests/database/hosted/verify.sql
    local_psql -f /tmp/fieldmaps-tests/database/tests/run.sql
    docker exec -i supabase_db_field-maps psql -X -U supabase_admin -d postgres -v ON_ERROR_STOP=1 \
      -f /tmp/fieldmaps-tests/database/tests/auth_hooks.sql
    local_psql -f /tmp/fieldmaps-tests/database/hosted/verify.sql
    ;;
  api-test)
    cd backend
    uv run --frozen pytest
    ;;
  help|--help|-h)
    printf '%s\n' 'Usage: sh database/local-supabase.sh start|stop|reset|test|api-test' \
      'reset replaces the persistent local database; reset --disposable builds a fresh temporary baseline only.'
    ;;
  *) printf '%s\n' 'Unknown command. Use --help.' >&2; exit 2 ;;
esac
