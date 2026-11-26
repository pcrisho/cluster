#!/usr/bin/env bash
# Restore on an empty machine with only postgres and storage up. Usage: restore.sh [--force] [snapshot-id]
# Steps and drill: docs/deploy/backups.md
set -euo pipefail
# shellcheck source=scripts/backup/common.sh
. "$(dirname "$0")/common.sh"
: "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
force=
if [ "${1:-}" = --force ]; then force=1; shift; fi

tables=$(echo "select count(*) from pg_tables where schemaname = 'public'" | psql_owner)
if [ "$tables" != 0 ] && [ -z "$force" ]; then
  echo "the database has $tables tables; use --force to overwrite it" >&2
  exit 1
fi

out=$BACKUP_DIR/restore
rm -rf "$out"
mkdir -p "$out"
restic restore "${1:-latest}" --target "$out"
dump=$(find "$out" -name cluster.dump)
[ -f "$dump" ] || { echo "no cluster.dump in the snapshot" >&2; exit 1; }

# Roles first: the dump grants to cluster_app and cluster_system, which a new server does not have.
dc run --rm migrate node dist/db-roles.js
clean=
[ -z "$force" ] || clean="--clean --if-exists"
dc exec -T postgres sh -c "exec pg_restore -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" --single-transaction $clean" < "$dump"
dc run --rm migrate # roles again, and migrate deploy: nothing to apply after a restore
rclone_s3 copy "$(dirname "$dump")/bucket" "s3:${STORAGE_BUCKET:-cluster}" # copy, never sync: it deletes nothing
rm -rf "$out"
echo "restored; now: docker compose up -d"
