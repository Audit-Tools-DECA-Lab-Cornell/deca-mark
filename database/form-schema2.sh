#!/bin/sh
# Explicit local-only operation. Applying requires separate migration authorization.
set -eu
cd "$(dirname "$0")/../backend"
PYTHONPATH=src exec .venv/bin/python -m fieldmaps_api.form_schema_upgrade "$@"
