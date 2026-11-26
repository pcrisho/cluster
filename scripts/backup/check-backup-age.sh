#!/bin/sh
# Exit 1 if the last good backup is older than N hours (default 26). For cron: docs/deploy/backups.md
f=${BACKUP_OK_FILE:-${BACKUP_DIR:-/var/backups/cluster}/last-ok}
h=${1:-26}
[ -n "$(find "$f" -mmin -$((h * 60)) 2>/dev/null)" ] || { echo "backup older than ${h}h or missing: $f"; exit 1; }
