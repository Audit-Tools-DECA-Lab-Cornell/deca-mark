#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
gis09_test_file="$(pwd)/database/tests/test_gis09_api.py"
exec sh database/zone-api-rehearsal.sh -c pyproject.toml "$gis09_test_file" "$@"
