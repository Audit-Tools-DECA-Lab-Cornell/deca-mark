#!/bin/sh
# Browser acceptance for the web app against the LOCAL stack only, then Playwright.
#
#   scripts/e2e-local.sh [options] [playwright args…]
#     e.g. scripts/e2e-local.sh --project=desktop-1440 e2e/sign-in.spec.ts
#
# Options (everything else, and everything after `--`, goes to `playwright test`):
#   --prod        `next build` then `next start` instead of the default `next dev`.
#   --reuse-web   Use the web app already answering on the port; start nothing for it.
#   --skip-seed   Skip the seed when its manifest already exists. The seed signs in eight accounts and local
#                 Auth allows 30 sign-ins per 5 minutes, so reruns within minutes should skip it.
#   --zones       Also seed the separate synthetic zone-review project; expose E2E_ZONE_MANIFEST to tests.
#   --stop-web    Stop the web app this script started once Playwright finishes.
#   --stop        Only stop the web app this script started (Docker, Supabase and the API keep running).
#
# Idempotent. Each piece is started only when it is not already answering, and is left running:
#   Docker (dockerd) → local Supabase (pnpm db:start) → API on 127.0.0.1:8001 (backend/config.auth-local.json)
#   → seed (database/seed-web-workspace.mjs; no reset) → web app on 127.0.0.1:3000 → pnpm --dir web test:e2e
#
# The web app runs on :3000 because map packages go from the browser to the API directly, and :3000 is the only
# browser origin the local API allows (browser_origins in backend/config.auth-local.json). E2E_WEB_PORT picks
# another port only if that file allows it. `next dev` writes to web/.next/dev and `next build` cleans everything
# in web/.next except dev/, cache/ and the lock, so a dev run and someone else's build do not disturb each other;
# only one `next dev` can run in web/ at a time.
#
# Only loopback addresses are used. Configuration comes from `supabase status` (in memory, as the seed reads it)
# and is passed on the command line; no .env file is read, and Next.js is told not to load one.
set -eu
cd "$(dirname "$0")/.."
root=$(pwd)
state="$root/database/.local/e2e"
web_port=${E2E_WEB_PORT:-3000}
web_url="http://127.0.0.1:$web_port"
api_url="http://127.0.0.1:8001"
supabase_cli="supabase@2.118.0"

say() { printf 'e2e-local: %s\n' "$*"; }
fail() {
  printf 'e2e-local: %s\n' "$*" >&2
  exit 1
}

# ---- Options -----------------------------------------------------------------------------------------------------
web_mode=dev
skip_seed=0
zones=0
stop_after=0
only_stop=0
passthrough=0
count=$#
index=0
while [ "$index" -lt "$count" ]; do
  arg=$1
  shift
  index=$((index + 1))
  if [ "$passthrough" = 1 ]; then
    set -- "$@" "$arg"
    continue
  fi
  case "$arg" in
    --prod) web_mode=prod ;;
    --reuse-web) web_mode=reuse ;;
    --skip-seed) skip_seed=1 ;;
    --zones) zones=1 ;;
    --stop-web) stop_after=1 ;;
    --stop) only_stop=1 ;;
    --) passthrough=1 ;;
    *) set -- "$@" "$arg" ;;
  esac
done

# A plain-HTTP loopback URL on the expected port, or exit. Same rule as the seed's localUrl().
loopback() {
  node -e '
    const [value, port] = process.argv.slice(1);
    const url = new URL(value);
    const ok = url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && url.port === port && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash;
    if (!ok) { console.error(`Refusing ${url.origin}: only loopback http on port ${port}.`); process.exit(1); }
  ' "$1" "$2" || fail "Only the local stack is used; refusing $1."
}

answers() { curl -fsS -o /dev/null --noproxy "*" --max-time 10 "$1" 2>/dev/null; }

port_busy() {
  node -e '
    const socket = require("node:net").connect(Number(process.argv[1]), "127.0.0.1");
    socket.on("connect", () => process.exit(0)); socket.on("error", () => process.exit(1));
  ' "$1"
}

wait_until() { # label seconds command…
  label=$1 seconds=$2
  shift 2
  i=0
  until "$@"; do
    i=$((i + 1))
    [ "$i" -ge "$seconds" ] && return 1
    sleep 1
  done
  say "$label ready"
}

# Detached from this shell so it outlives the script; the pid is the process group to stop later.
start_detached() { # log command…
  log=$1
  shift
  if command -v setsid >/dev/null 2>&1; then
    setsid nohup "$@" >"$log" 2>&1 </dev/null &
  else
    nohup "$@" >"$log" 2>&1 </dev/null &
  fi
  last_pid=$!
}

alive() { [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null; }

stop_group() { # pidfile
  [ -f "$1" ] || return 0
  pid=$(cat "$1")
  rm -f "$1"
  kill -0 "$pid" 2>/dev/null || return 0
  kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null || true
  i=0
  while kill -0 "$pid" 2>/dev/null && [ "$i" -lt 20 ]; do
    i=$((i + 1))
    sleep 1
  done
  kill -KILL -- "-$pid" 2>/dev/null || true
}

mkdir -p "$state"
chmod 700 "$root/database/.local" "$state"

if [ "$only_stop" = 1 ]; then
  if alive "$state/web.pid"; then
    stop_group "$state/web.pid"
    say "stopped the web app this script started"
  else
    rm -f "$state/web.pid" "$state/web.mode"
    say "no web app started by this script is running"
  fi
  exit 0
fi

# ---- Toolchain ---------------------------------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || fail "Node 24 is required."
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' || fail "Use Node 24 (found $(node -v))."
command -v pnpm >/dev/null 2>&1 || fail "pnpm 10.17.1 is required."
[ "$(pnpm --version)" = "10.17.1" ] || say "warning: pnpm $(pnpm --version) found; the repository pins 10.17.1"
command -v curl >/dev/null 2>&1 || fail "curl is required."
loopback "$web_url/" "$web_port"
loopback "$api_url/" 8001

# The browser sends map packages to the API directly, so the web origin must be one the local API allows.
node -e '
  const config = JSON.parse(require("node:fs").readFileSync("backend/config.auth-local.json", "utf8"));
  const allowed = (config.browser_origins ?? []).map(origin => origin.replace(/\/$/, ""));
  const origin = process.argv[1];
  if (!allowed.includes(origin)) {
    console.error(`The local API allows ${allowed.join(", ") || "no browser origin"}, not ${origin}. Set E2E_WEB_PORT to an allowed port.`);
    process.exit(1);
  }
' "$web_url" || fail "Web port $web_port is not an allowed browser origin."

# Dependencies are installed from the lockfiles only, and only when missing.
has_dependencies() {
  node -e '
    const pkg = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
    process.exit(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).length > 0 ? 0 : 1);
  ' "$1"
}
if has_dependencies package.json && [ ! -d node_modules ]; then pnpm install --frozen-lockfile; fi
[ -d web/node_modules ] || pnpm --dir web install --frozen-lockfile

# ---- Docker ------------------------------------------------------------------------------------------------------
docker_up() { docker info >/dev/null 2>&1; }
if docker_up; then
  say "Docker already running"
else
  command -v dockerd >/dev/null 2>&1 || fail "Docker is not running and dockerd is not installed."
  say "starting dockerd (log: $state/dockerd.log)"
  start_detached "$state/dockerd.log" dockerd
  echo "$last_pid" >"$state/dockerd.pid"
  wait_until "Docker" 90 docker_up || fail "Docker did not start; see $state/dockerd.log."
fi

# ---- Local Supabase ----------------------------------------------------------------------------------------------
say "starting local Supabase (pnpm db:start; running services are kept)"
pnpm db:start

# ---- API ---------------------------------------------------------------------------------------------------------
if answers "$api_url/ready"; then
  say "API already answering at $api_url"
else
  port_busy 8001 && fail "Port 8001 is in use by something that is not a ready DECA Mark API."
  command -v uv >/dev/null 2>&1 || fail "uv is required to run the API."
  say "starting the API on $api_url (log: $state/api.log)"
  cd backend
  start_detached "$state/api.log" env DECAMARK_CONFIG=config.auth-local.json \
    uv run --frozen uvicorn fieldmaps_api.main:create_app_from_config --factory --app-dir src \
    --host 127.0.0.1 --port 8001
  echo "$last_pid" >"$state/api.pid"
  cd "$root"
  wait_until "API" 120 answers "$api_url/ready" || fail "The API did not become ready; see $state/api.log."
fi

# ---- Seed --------------------------------------------------------------------------------------------------------
. "$root/scripts/e2e-local-seed.sh"
seed_e2e "$root" "$api_url" "$skip_seed" "$zones"

# ---- Public Auth configuration, from the pinned CLI's status in memory (as the seed reads it) --------------------
supabase_env=$(pnpm dlx "$supabase_cli" status --output json 2>/dev/null | node -e '
  let input = "";
  process.stdin.on("data", chunk => (input += chunk)).on("end", () => {
    const status = JSON.parse(input);
    const url = new URL(status.API_URL);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "54321") {
      console.error("Local Supabase reported a non-local Auth address."); process.exit(1);
    }
    const key = status.PUBLISHABLE_KEY || status.ANON_KEY;
    if (!key) { console.error("Local Supabase reported no public key."); process.exit(1); }
    process.stdout.write(`${url.origin}\n${key}\n`);
  });
') || fail "Could not read local Supabase status."
supabase_url=$(printf '%s\n' "$supabase_env" | sed -n 1p)
supabase_key=$(printf '%s\n' "$supabase_env" | sed -n 2p)
loopback "$supabase_url/" 54321

# Every variable the web app reads, set here and local only. Values from the calling shell that could point
# elsewhere are dropped, and __NEXT_PROCESSED_ENV stops Next.js from loading any .env file.
unset NEXT_PUBLIC_FIELDMAPS_PROJECT_ID NEXT_PUBLIC_ANDROID_APP_URL NEXT_PUBLIC_PREVIEW_TOOLS
export __NEXT_PROCESSED_ENV=true NEXT_TELEMETRY_DISABLED=1
export NEXT_PUBLIC_SUPABASE_URL="$supabase_url" NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="$supabase_key"
export DECAMARK_API_URL="$api_url" NEXT_PUBLIC_DECAMARK_API_URL="$api_url"

# ---- Web app -----------------------------------------------------------------------------------------------------
start_web() { # dev|prod
  port_busy "$web_port" &&
    fail "Port $web_port is in use by a server this script did not start. Stop it, or pass --reuse-web if it runs against this local stack."
  if [ "$1" = prod ]; then
    say "building the web app (log: $state/web-build.log)"
    pnpm --dir web exec next build >"$state/web-build.log" 2>&1 || {
      tail -n 40 "$state/web-build.log" >&2
      fail "next build failed; see $state/web-build.log. Without --prod the suite runs on next dev, without a build."
    }
    say "starting the web app on $web_url (log: $state/web.log)"
    start_detached "$state/web.log" pnpm --dir web exec next start --hostname 127.0.0.1 --port "$web_port"
  else
    say "starting the web app with next dev on $web_url (log: $state/web.log)"
    start_detached "$state/web.log" pnpm --dir web exec next dev --hostname 127.0.0.1 --port "$web_port"
  fi
  echo "$last_pid" >"$state/web.pid"
  echo "$1" >"$state/web.mode"
  i=0
  until answers "$web_url/sign-in"; do
    if ! alive "$state/web.pid"; then
      tail -n 20 "$state/web.log" >&2
      grep -q "already running" "$state/web.log" &&
        fail "Another next dev is already running in web/ (only one can). Stop it, or use --prod."
      fail "The web app stopped; see $state/web.log."
    fi
    i=$((i + 1))
    [ "$i" -ge 240 ] && fail "The web app did not answer within 4 minutes; see $state/web.log."
    sleep 1
  done
  say "web app ready"
}

case "$web_mode" in
  reuse)
    answers "$web_url/sign-in" || fail "--reuse-web, but nothing answers at $web_url."
    say "reusing the web app at $web_url"
    ;;
  dev)
    # A dev server this script started earlier, with the same configuration, is kept: it recompiles on change.
    if alive "$state/web.pid" && [ "$(cat "$state/web.mode" 2>/dev/null)" = dev ] && answers "$web_url/sign-in"; then
      say "reusing the next dev this script started (pid $(cat "$state/web.pid"))"
    else
      stop_group "$state/web.pid"
      start_web dev
    fi
    ;;
  prod)
    stop_group "$state/web.pid"
    start_web prod
    ;;
esac

# The first request to each page compiles it under next dev; warm the main ones so specs time pages, not builds.
mode_for_tests=$web_mode
[ "$web_mode" = reuse ] && mode_for_tests=$(cat "$state/web.mode" 2>/dev/null || echo prod)
if [ "$mode_for_tests" = dev ]; then
  say "warming pages under next dev"
  for path in / /sign-in /o /join /invite; do
    curl -sS -o /dev/null --noproxy "*" --max-time 180 "$web_url$path" 2>/dev/null || true
  done
fi

# ---- Playwright --------------------------------------------------------------------------------------------------
say "running Playwright against $web_url"
status=0
E2E_BASE_URL="$web_url" E2E_MANIFEST="$manifest" E2E_WEB_MODE="$mode_for_tests" \
  pnpm --dir web test:e2e "$@" || status=$?

if [ "$stop_after" = 1 ] && [ "$web_mode" != reuse ]; then
  stop_group "$state/web.pid"
  rm -f "$state/web.mode"
  say "stopped the web app"
fi
say "left running: Docker, local Supabase (stop: pnpm db:stop) and the API on :8001 (stop: kill -TERM -- -\$(cat database/.local/e2e/api.pid))"
[ "$stop_after" = 1 ] || say "web app still on :$web_port (stop: scripts/e2e-local.sh --stop)"
say "rerun quickly: scripts/e2e-local.sh --skip-seed [playwright args]"
say "screenshots: web/e2e/screenshots/   report: pnpm --dir web exec playwright show-report ../database/.local/e2e/playwright-report"
exit "$status"
