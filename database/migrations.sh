#!/bin/sh
set -eu
cd "$(dirname "$0")/.."

case "${1:-guide}" in
  guide|--help|-h)
    printf '%s\n' \
      'DECA Mark database migrations (Supabase CLI 2.118.0)' \
      '' \
      'Hosted Forms: start with this read-only check:' \
      'pnpm db:migrations:hosted   Compare local files with the linked hosted history (read-only)' \
      '' \
      'If 20261024090000 is missing remotely, the hosted migration is still pending.' \
      'The repaired preflight preserves valid legacy fields-only forms without conversion.' \
      'Local migration commands do not repair the hosted Forms page.' \
      '' \
      'Preparation requires an authorized snapshot file that already exists.' \
      'pnpm db:forms:prepare --help   Show offline SQL preparation; does not capture a snapshot' \
      'Do not run a bare db push, delete forms or relabel versions to bypass validation.' \
      '' \
      'Current release gates and error explanations: docs/Database-Migrations.md' \
      'Operator procedure for review and approved application: database/hosted/form-schema2-rollout.md'
    ;;
  status)
    if [ "$#" -ne 1 ]; then
      printf '%s\n' 'Usage: pnpm db:migrations:hosted (uses the linked project)' >&2
      exit 2
    fi
    exec pnpm dlx supabase@2.118.0 migration list --linked
    ;;
  prepare)
    shift
    if [ "$#" -eq 1 ] && [ "$1" != '--help' ] && [ "$1" != '-h' ]; then
      if [ ! -f "$1" ]; then
        printf '%s\n' "Snapshot file not found: $1" \
          'This command does not capture a hosted snapshot. See docs/Database-Migrations.md.' >&2
        exit 2
      fi
      exec < "$1"
      shift
    fi
    if [ ! -x backend/.venv/bin/python ]; then
      printf '%s\n' 'Python runtime missing. Run pnpm backend:setup first.' >&2
      exit 2
    fi
    cd backend/src
    exec ../.venv/bin/python -m fieldmaps_api.form_schema_bundle "$@"
    ;;
  *)
    printf '%s\n' 'Unknown migration command. Use pnpm db:migrate:guide.' >&2
    exit 2
    ;;
esac
