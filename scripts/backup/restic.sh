#!/usr/bin/env bash
# Wrapper to run restic commands (init, snapshots, check, etc.) using host restic or the restic Docker image.
set -euo pipefail
# shellcheck source=scripts/backup/common.sh
. "$(dirname "$0")/common.sh"
: "${RESTIC_REPOSITORY:?}" "${RESTIC_PASSWORD_FILE:?}"
run_restic "$@"
