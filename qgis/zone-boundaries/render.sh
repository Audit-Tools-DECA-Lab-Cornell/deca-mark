#!/bin/sh
set -eu
here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
app=${QGIS_APP:-/Applications/QGIS-final-4_2_2.app}/Contents
export PYTHONHOME="$app/Resources"
export PYTHONPATH="$app/Resources/python3.12:$app/Resources/python3.12/site-packages:$app/Resources/python3.12/lib-dynload"
export PROJ_DATA="$app/Resources/qgis/proj"
export QT_QPA_PLATFORM=offscreen
"$app/MacOS/python3.12" "$here/render.py" "$@" --prefix "$app/Resources/qgis"
"$app/MacOS/python3.12" "$here/verify_project.py" "$1" --prefix "$app/Resources/qgis"
