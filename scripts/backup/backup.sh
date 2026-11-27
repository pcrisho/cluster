#!/usr/bin/env bash
# Scheduled backup: owner pg_dump + bucket mirror, then restic off the host. Cron and setup: docs/deploy/backups.md
set -euo pipefail
# shellcheck source=scripts/backup/common.sh
. "$(dirname "$0")/common.sh"
: "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
BACKUP_OK_FILE=${BACKUP_OK_FILE:-$BACKUP_DIR/last-ok}
BACKUP_HOST=${BACKUP_HOST:-cluster}
BACKUP_KEEP_HOURLY=${BACKUP_KEEP_HOURLY:-0}
BACKUP_KEEP_DAILY=${BACKUP_KEEP_DAILY:-7}
BACKUP_KEEP_WEEKLY=${BACKUP_KEEP_WEEKLY:-4}
BACKUP_KEEP_MONTHLY=${BACKUP_KEEP_MONTHLY:-6}
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

run_restic backup --host "$BACKUP_HOST" "$stage"
forget_args=(
  --host "$BACKUP_HOST"
  --keep-daily "$BACKUP_KEEP_DAILY"
  --keep-weekly "$BACKUP_KEEP_WEEKLY"
  --keep-monthly "$BACKUP_KEEP_MONTHLY"
  --prune
)
if [ "$BACKUP_KEEP_HOURLY" -gt 0 ] 2>/dev/null; then
  forget_args=(--keep-hourly "$BACKUP_KEEP_HOURLY" "${forget_args[@]}")
fi
run_restic forget "${forget_args[@]}"
date -u +%FT%TZ > "$BACKUP_OK_FILE"
[ -z "${BACKUP_PING_URL:-}" ] || curl -fsS -m 10 "$BACKUP_PING_URL" > /dev/null || true # healthchecks.io style ping
