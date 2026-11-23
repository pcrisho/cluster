#!/bin/sh
# Prints a line and exits 1 when a filesystem is above THRESHOLD % (default 80). Run from cron (runbook, section 4).
# Set UPLOAD_TMP_DIR to the HOST folder behind the API's upload volume, if there is one.
THRESHOLD=${THRESHOLD:-80}
status=0
for path in / /var/lib/docker "${UPLOAD_TMP_DIR:-/tmp}"; do
  [ -d "$path" ] || continue
  used=$(df -P "$path" | awk 'NR==2 {gsub("%", ""); print $5}')
  [ "$used" -ge "$THRESHOLD" ] && { echo "disk $path at ${used}%"; status=1; }
done
exit $status
