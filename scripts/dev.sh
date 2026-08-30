#!/bin/sh
# Dev launcher used by the Freebuff preview runner.
# 1. Ensures a local Convex backend is reachable on :3210 — starts one only
#    when nothing is listening (avoids clashing with a platform-managed one).
# 2. Serves the frontend with Vite bound to 0.0.0.0.
set -u

export CONVEX_TMPDIR=/tmp/convex
mkdir -p /tmp/convex

if ! curl -s -m 2 -o /dev/null http://127.0.0.1:3210/ 2>/dev/null && \
   ! curl -s -m 2 -o /dev/null https://127.0.0.1:3210/ 2>/dev/null; then
  # The local Convex sandbox (`.convex/local`) can be left with an unfinished
  # export after an interrupted `convex dev` run. Every later start then fails
  # with "ExportInProgress" and the preview runs with NO backend — login dies
  # silently. When :3210 is down that state is stale by definition, so reset
  # it and let the backend boot cleanly (the app re-seeds on first login).
  echo "[dev] no Convex backend on :3210 — resetting stale sandbox state..."
  rm -rf .convex/local
  echo "[dev] starting Convex backend..."
  node ./node_modules/convex/bin/main.js dev --typecheck=disable &
  CONVEX_PID=$!
  # Give the backend time to boot before Vite starts receiving traffic.
  i=0
  while [ $i -lt 60 ]; do
    if curl -s -m 2 -o /dev/null http://127.0.0.1:3210/ 2>/dev/null; then
      echo "[dev] Convex backend is up"
      break
    fi
    i=$((i + 1))
    sleep 1
  done
  if [ $i -ge 60 ]; then
    echo "[dev] ERROR: Convex backend did not start on :3210 — the preview cannot log in without it."
    exit 1
  fi
fi

exec node ./node_modules/vite/bin/vite.js --host 0.0.0.0 --port 3000 "$@"
