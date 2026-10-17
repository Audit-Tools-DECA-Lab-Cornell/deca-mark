#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ "$#" -eq 0 ]; then
  echo "Usage: $0 ANALYSIS_DIRECTORY --delayed-point OBSERVATION_UUID [render options]" >&2
  exit 2
fi
app=${QGIS_APP:-/Applications/QGIS-final-4_2_2.app}/Contents
if [ -n "${QGIS_PYTHON:-}" ]; then
  python=$QGIS_PYTHON
  prefix=${QGIS_PREFIX_PATH:?Set QGIS_PREFIX_PATH with QGIS_PYTHON}
elif [ -x "$app/MacOS/python3.12" ]; then
  python=$app/MacOS/python3.12
  prefix=$app/Resources/qgis
  export PYTHONHOME="$app/Resources"
  export PYTHONPATH="$app/Resources/python3.12:$app/Resources/python3.12/site-packages:$app/Resources/python3.12/lib-dynload"
  export PROJ_DATA="$app/Resources/qgis/proj"
elif [ -d /usr/share/qgis ] && [ -x /usr/bin/python3 ]; then
  python=/usr/bin/python3
  prefix=${QGIS_PREFIX_PATH:-/usr}
else
  echo "No installed QGIS runtime found; set QGIS_PYTHON and QGIS_PREFIX_PATH." >&2
  exit 1
fi
runtime=$(mktemp -d "${TMPDIR:-/tmp}/decamark-qgis.XXXXXXXX")
trap 'rm -rf "$runtime"' EXIT HUP INT TERM
export XDG_CACHE_HOME="$runtime/cache"
export XDG_CONFIG_HOME="$runtime/config"
export XDG_DATA_HOME="$runtime/data"
export XDG_RUNTIME_DIR="$runtime/runtime"
mkdir -p "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$XDG_DATA_HOME" "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"
export QT_QPA_PLATFORM=offscreen
"$python" "$here/render.py" "$@" --prefix "$prefix"
"$python" "$here/verify_project.py" "$1" --prefix "$prefix"
