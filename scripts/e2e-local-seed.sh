# Sourced by e2e-local.sh. Seeds only after the caller's local Auth/API guards pass.
seed_e2e() {
  seed_root=$1 seed_api=$2 seed_skip=$3 seed_zones=$4
  manifest="$seed_root/database/.local/web-workspace.json"
  if [ "$seed_skip" != 1 ] || [ ! -f "$manifest" ]; then
    node --test database/seed-web-workspace.test.mjs
    node database/seed-web-workspace.mjs --api-url "$seed_api"
  fi
  [ -f "$manifest" ] || { printf '%s\n' "The seed did not write $manifest." >&2; return 1; }

  # Zone specs use a separate project/manifest; normal spec inputs stay unchanged.
  unset E2E_ZONE_MANIFEST
  if [ "$seed_zones" = 1 ]; then
    zone_manifest="$seed_root/database/.local/zone-review.json"
    if [ "$seed_skip" != 1 ] || [ ! -f "$zone_manifest" ]; then
      node --test database/seed-zone-review.test.mjs
      node database/seed-zone-review.mjs --api-url "$seed_api"
    fi
    [ -f "$zone_manifest" ] || { printf '%s\n' "The zone seed did not write $zone_manifest." >&2; return 1; }
    export E2E_ZONE_MANIFEST="$zone_manifest"
  fi
}
