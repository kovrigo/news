#!/usr/bin/env bash
# Board staging site, run from the base checkout as `scripts/staging-site.sh $PORT`.
# vmsetup's board/deploy/staging-sites.sh keeps it alive per .staging-site.json, publishes
# the port on the tailnet and restarts it when staging moves. Binds 127.0.0.1 only.
# State lives in out/staging/state.json: kept across restarts, seeded once when missing.
set -euo pipefail
export PORT="${1:?usage: staging-site.sh <port>}"
export DEMO_STATE=out/staging/state.json
cd "$(dirname "${BASH_SOURCE[0]}")/.."
bun install --frozen-lockfile
[ -f "$DEMO_STATE" ] || bun run demo-reset
exec bash scripts/paneweb-dev.sh
