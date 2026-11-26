#!/usr/bin/env bash
# Creates or drops the load-test database, in the load-test Postgres (docker-compose.perf.yml, port 55432),
# which is separate from the dev one: the dev (`cluster`) and e2e (`cluster_test`) databases are never touched.
#
#   scripts/perf/db.sh setup      start the perf Postgres, create cluster_perf, migrate, run the normal seed, add synthetic data
#   scripts/perf/db.sh orgs       after setup: add 4 organizations and GROW, structure and audit data to all (seed-orgs.sql)
#   scripts/perf/db.sh teardown   remove the perf containers AND their data (database and stored files)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/scripts/perf/docker-compose.perf.yml")
DB="cluster_perf"

case "${1:-}" in
  setup)
    "${COMPOSE[@]}" up -d --wait postgres
    docker exec -i perf-postgres psql -U cluster -d postgres -c "CREATE DATABASE $DB"
    export DATABASE_OWNER_URL="postgresql://cluster:cluster@localhost:55432/$DB"
    export DATABASE_URL="postgresql://cluster_app:cluster_app@localhost:55432/$DB"
    export DATABASE_SYSTEM_URL="postgresql://cluster_system:cluster_system@localhost:55432/$DB"
    cd "$ROOT/apps/api"
    pnpm exec tsx src/db-roles.ts   # creates cluster_app and cluster_system with the passwords of their URLs, before the migrations grant to it
    npx prisma migrate deploy
    # dotenv does not override these URLs, so the seed runs against $DB and not the ones in .env
    pnpm exec dotenv -e ../../.env -- tsx prisma/seed.ts
    docker exec -i perf-postgres psql -U cluster -d "$DB" < "$ROOT/scripts/perf/seed.sql"
    echo "Ready: $DB. Next: scripts/perf/stack.sh start min"
    ;;
  orgs)
    docker exec -i perf-postgres psql -U cluster -d "$DB" < "$ROOT/scripts/perf/seed-orgs.sql"
    ;;
  teardown)
    "${COMPOSE[@]}" down -v
    ;;
  *)
    echo "usage: $0 setup|orgs|teardown" >&2
    exit 1
    ;;
esac
