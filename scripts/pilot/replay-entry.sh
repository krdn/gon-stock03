#!/usr/bin/env bash
set -euo pipefail
cp -R /input/. /app/
cd /app
node node_modules/vite/bin/vite.js build --configLoader runner >/tmp/build.log || { cat /tmp/build.log; exit 70; }
node --import tsx scripts/e2e-server.ts >/tmp/server.log 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
for attempt in {1..100}; do
  if curl --noproxy '*' -fsS http://127.0.0.1:4314/api/state -o /dev/null 2>/dev/null; then
    probe_status=0
    node /probe/replay.mjs || probe_status=$?
    exit "$probe_status"
  fi
  if ! kill -0 "$server_pid" 2>/dev/null; then cat /tmp/server.log >&2; exit 70; fi
  sleep .1
done
echo "isolated server did not become ready on port 4314" >&2
cat /tmp/server.log >&2
exit 70
