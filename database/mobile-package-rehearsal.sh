#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mobile_test_file="$(pwd)/database/tests/test_mobile_package_api.py"
exec sh database/zone-api-rehearsal.sh -c pyproject.toml "$mobile_test_file" "$@"
