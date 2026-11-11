#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
runtime_image="decamark-runtime-import-smoke:$$"
runtime_container="decamark-runtime-import-smoke-$$"

cleanup() {
  docker rm -f "$runtime_container" >/dev/null 2>&1 || true
  docker image rm "$runtime_image" >/dev/null 2>&1 || true
}
trap cleanup EXIT HUP INT TERM

docker build --platform linux/amd64 --target runtime --tag "$runtime_image" \
  --file "$root/backend/Dockerfile" "$root/backend"
docker run --rm --name "$runtime_container" --platform linux/amd64 --network none \
  --env PYTHONPATH=/app/src \
  --mount "type=bind,source=$root/backend/tests/runtime_import_smoke.py,target=/tmp/runtime_import_smoke.py,readonly" \
  --mount "type=bind,source=$root/qgis/demo-playground-2026-10-15/janet-synthetic-playground.qgz,target=/fixtures/janet-synthetic-playground.qgz,readonly" \
  --mount "type=bind,source=$root/qgis/demo-playground-2026-10-15/desktop/janet-synthetic-playground.qgs,target=/fixtures/janet-synthetic-playground.qgs,readonly" \
  "$runtime_image" python /tmp/runtime_import_smoke.py
