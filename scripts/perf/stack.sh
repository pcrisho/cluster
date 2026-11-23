#!/usr/bin/env bash
# The load-test box: Postgres, Redis and storage (docker-compose.perf.yml) plus the API, collab and web,
# all pinned to the cores of a profile and under memory caps, to model one small server. The dev stack is not touched.
#
#   scripts/perf/stack.sh start [min|rec]   default min
#   scripts/perf/stack.sh stop              stops everything, keeps the data
#   scripts/perf/stack.sh status
#
# Profiles (what the server would have; caps leave room for the OS):
#   min   1 CPU,  2 GB: api 512M  web 256M  collab 192M  postgres 384M (shared_buffers 128MB)  redis 64M   storage 256M
#   rec   2 CPU,  4 GB: api 1G    web 384M  collab 256M  postgres 1G   (shared_buffers 256MB)  redis 128M  storage 768M
# PERF_CPUSET picks the cores (default 2 for min, 4,6 for rec: different physical cores on a hyper-threaded
# machine; keep their siblings, and the load generator, elsewhere: `taskset -c 8-11 node ...`).
# Ports: API 3011, collab 3012, web 3013, Postgres 55432, Redis 56379, storage 59000.
# The API and collab run from `dist` (`pnpm build` first); the web needs `.next/standalone` and is skipped without it.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/scripts/perf/docker-compose.perf.yml")
LOGS="${PERF_TMP:-${TMPDIR:-/tmp}/cluster-perf}"
mkdir -p "$LOGS"
NODE="$(command -v node)"
DB_URL="postgresql://cluster_app:cluster_app@localhost:55432/cluster_perf"
DB_SYSTEM_URL="postgresql://cluster_system:cluster_system@localhost:55432/cluster_perf"

profile() {
  case "${1:-min}" in
    min) CPUSET=2;   API_MEM=512M; WEB_MEM=256M; COLLAB_MEM=192M; PG_MEM=384m; PG_SHARED=128MB; REDIS_MEM=64m;  STORAGE_MEM=256m ;;
    rec) CPUSET=4,6; API_MEM=1G;   WEB_MEM=384M; COLLAB_MEM=256M; PG_MEM=1g;   PG_SHARED=256MB; REDIS_MEM=128m; STORAGE_MEM=768m ;;
    *) echo "profile must be min or rec" >&2; exit 1 ;;
  esac
  CPUSET="${PERF_CPUSET:-$CPUSET}"
  export PERF_CPUSET="$CPUSET" PERF_PG_MEM="$PG_MEM" PERF_PG_SHARED="$PG_SHARED" PERF_REDIS_MEM="$REDIS_MEM" \
    PERF_STORAGE_MEM="$STORAGE_MEM"
}

# run <name> <memory> <workdir> <script> [KEY=VALUE ...]
run() {
  local name="$1" mem="$2" dir="$3" script="$4"; shift 4
  # taskset, not AllowedCPUs: the user systemd manager does not delegate the cpuset controller and ignores it silently
  local props=(-p "MemoryMax=$mem" -p MemorySwapMax=0 -p "WorkingDirectory=$dir"
    -p "StandardOutput=file:$LOGS/$name.log" -p "StandardError=inherit")
  local envs=(); for kv in "$@"; do envs+=(--setenv="$kv"); done
  systemd-run --user --quiet --collect --unit="perf-$name" "${props[@]}" "${envs[@]}" taskset -c "$CPUSET" "$NODE" "$script"
}

# Every service must run only on the cores of the profile, or the CPU numbers mean nothing
verify_pinning() {
  local svc pid allowed
  for svc in api collab web; do
    pid="$(systemctl --user show "perf-$svc" -p MainPID --value 2>/dev/null)"
    [ -n "$pid" ] && [ "$pid" != 0 ] || continue
    allowed="$(awk '/Cpus_allowed_list/ {print $2}' "/proc/$pid/status")"
    [ "$allowed" = "$CPUSET" ] || { echo "perf-$svc runs on cores $allowed, expected $CPUSET" >&2; exit 1; }
  done
  for svc in perf-postgres perf-redis perf-storage; do
    allowed="$(docker inspect -f '{{.HostConfig.CpusetCpus}}' "$svc")"
    [ "$allowed" = "$CPUSET" ] || { echo "$svc runs on cores $allowed, expected $CPUSET" >&2; exit 1; }
  done
}

start() {
  profile "${1:-min}"
  [ -f "$ROOT/apps/api/dist/main.js" ] || { echo "apps/api/dist missing: pnpm build" >&2; exit 1; }
  echo "$CPUSET" > "$LOGS/cpuset"
  "${COMPOSE[@]}" up -d --wait
  run api "$API_MEM" "$ROOT/apps/api" "$ROOT/apps/api/dist/main.js" "DATABASE_URL=$DB_URL" "DATABASE_SYSTEM_URL=$DB_SYSTEM_URL" API_PORT=3011 \
    REDIS_HOST=localhost REDIS_PORT=56379 STORAGE_HOST=localhost STORAGE_PORT=59000 \
    STORAGE_ACCESS_KEY=perf-storage STORAGE_SECRET_KEY=perf-storage-secret
  run collab "$COLLAB_MEM" "$ROOT/apps/collab" "$ROOT/apps/collab/dist/main.js" COLLAB_PORT=3012 \
    COLLAB_API_URL=http://localhost:3011/api/v1
  if [ -f "$ROOT/apps/web/.next/standalone/apps/web/server.js" ]; then
    run web "$WEB_MEM" "$ROOT/apps/web/.next/standalone/apps/web" "$ROOT/apps/web/.next/standalone/apps/web/server.js" \
      PORT=3013 HOSTNAME=127.0.0.1 NODE_ENV=production API_INTERNAL_URL=http://localhost:3011/api/v1
  else
    echo "web: .next/standalone not found, skipped (pnpm --filter @cluster/web build)"
  fi
  for _ in $(seq 1 40); do
    curl -sf localhost:3011/api/v1/health >/dev/null && curl -sf localhost:3012/health >/dev/null && { verify_pinning; echo "up: profile ${1:-min}, cores $CPUSET. logs: $LOGS"; return; }
    sleep 1
  done
  echo "not healthy after 40 s, see $LOGS/*.log" >&2; exit 1
}

case "${1:-}" in
  start) start "${2:-min}" ;;
  stop)
    systemctl --user stop perf-api perf-collab perf-web 2>/dev/null || true
    "${COMPOSE[@]}" stop 2>/dev/null || true ;;
  status)
    systemctl --user status perf-api perf-collab perf-web --no-pager 2>&1 | grep -E "●|Active|Memory|CPU" || true
    docker stats --no-stream --format '{{.Name}} cpu={{.CPUPerc}} mem={{.MemUsage}}' perf-postgres perf-redis perf-storage 2>/dev/null || true ;;
  *) echo "usage: $0 start [min|rec] | stop | status" >&2; exit 1 ;;
esac
