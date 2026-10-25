#!/usr/bin/env bash
# Deploy to Deno Deploy (org and app from deno.json's "deploy" block) from a clean tree.
# Needs DENO_DEPLOY_TOKEN in the environment; it is never printed. The jsr CLI runs from a
# temp dir with the repo path: run from inside the repo it fails on nodeModulesDir "manual".
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

if [ -n "$(git status --porcelain)" ]; then
  echo "deploy: the tree is dirty; commit first." >&2
  exit 1
fi
: "${DENO_DEPLOY_TOKEN:?deploy: set DENO_DEPLOY_TOKEN first}"

ORG="$(deno eval 'console.log(JSON.parse(Deno.readTextFileSync("deno.json")).deploy.org)')"
APP="$(deno eval 'console.log(JSON.parse(Deno.readTextFileSync("deno.json")).deploy.app)')"

deno install
deno task check
deno task test
deno task build

LOG="$(mktemp)"
trap 'rm -f "$LOG"' EXIT
(cd "$(dirname "$LOG")" && deno run -A --node-modules-dir=auto jsr:@deno/deploy "$REPO" \
  --org "$ORG" --app "$APP" --prod --non-interactive --json) 2>&1 | grep -v Initialize | tee "$LOG"

# The deploy CLI rewrites deno.json (a trailing blank line); the tree was clean, so restore it.
git checkout -- deno.json

URL="$(grep -o '"productionUrl":"[^"]*"' "$LOG" | cut -d'"' -f4 | tail -n 1 || true)"
[ -n "$URL" ] || { echo "deploy: no production URL in the output." >&2; exit 1; }
echo "$URL" > "$REPO/.deploy-url"
echo "deploy: $URL — now run: deno run -A scripts/smoke.ts $URL"
