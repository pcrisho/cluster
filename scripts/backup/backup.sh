#!/usr/bin/env bash
# Daily backup: owner pg_dump + bucket mirror, then restic off the host. Cron and setup: docs/deploy/backups.md
set -euo pipefail
# shellcheck source=scripts/backup/common.sh
. "$(dirname "$0")/common.sh"
: "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
BACKUP_OK_FILE=${BACKUP_OK_FILE:-$BACKUP_DIR/last-ok}
stage=$BACKUP_DIR/stage

mkdir -p "$stage/bucket"
exec 9>"$BACKUP_DIR/lock"
flock -n 9 || { echo "backup already running" >&2; exit 1; }

# Dump first, bucket second: the bucket copy is then a superset of what the dump references.
# shortcut: a file deleted between the two steps is missing from this snapshot, older snapshots keep it.
# shellcheck disable=SC2016 # expands inside the container
dc exec -T postgres sh -c 'exec pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$stage/cluster.dump.tmp"
dc exec -T postgres pg_restore -l < "$stage/cluster.dump.tmp" > /dev/null # a truncated dump fails here
mv "$stage/cluster.dump.tmp" "$stage/cluster.dump"
rclone_s3 sync "s3:${STORAGE_BUCKET:-cluster}" "$stage/bucket"

restic backup --host cluster "$stage"
restic forget --host cluster --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
date -u +%FT%TZ > "$BACKUP_OK_FILE"
[ -z "${BACKUP_PING_URL:-}" ] || curl -fsS -m 10 "$BACKUP_PING_URL" > /dev/null || true # healthchecks.io style ping
