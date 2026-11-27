# shellcheck shell=bash disable=SC2016 # single quotes on purpose: $POSTGRES_* expand inside the container
# Sourced by backup.sh, restore.sh and restic.sh (not run on its own). Runs from the repository root.
umask 077
cd "$(dirname "$0")/../.." || exit
: "${BACKUP_DIR:=/var/backups/cluster}"
RCLONE_IMAGE=rclone/rclone:1.75.1
RESTIC_IMAGE=${RESTIC_IMAGE:-restic/restic:0.18.1}

dc() {
  if [ -n "${ENV_FILE:-}" ]; then
    docker compose --env-file "$ENV_FILE" "$@"
  else
    docker compose "$@"
  fi
}

# SQL on stdin, as the database owner (never as cluster_app).
psql_owner() { dc exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA'; }

# Runs restic on the host if installed, or via the pinned restic container otherwise.
run_restic() {
  if [ "${FORCE_DOCKER_RESTIC:-0}" != "1" ] && command -v restic >/dev/null 2>&1; then
    restic "$@"
    return
  fi

  local cache_dir="$BACKUP_DIR/.restic-cache"
  mkdir -p "$BACKUP_DIR" "$cache_dir"
  local args=(
    run --rm
    --user "$(id -u):$(id -g)"
    -v "$BACKUP_DIR:$BACKUP_DIR"
    -v "$RESTIC_PASSWORD_FILE:$RESTIC_PASSWORD_FILE:ro"
    -e RESTIC_REPOSITORY
    -e RESTIC_PASSWORD_FILE
    -e "RESTIC_CACHE_DIR=$cache_dir"
  )
  if [ "${RESTIC_REPOSITORY#/}" != "$RESTIC_REPOSITORY" ]; then
    mkdir -p "$RESTIC_REPOSITORY"
    args+=(-v "$RESTIC_REPOSITORY:$RESTIC_REPOSITORY")
  fi
  local var
  for var in \
    AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION AWS_SESSION_TOKEN \
    B2_ACCOUNT_ID B2_ACCOUNT_KEY \
    AZURE_ACCOUNT_NAME AZURE_ACCOUNT_KEY \
    GOOGLE_PROJECT_ID GOOGLE_APPLICATION_CREDENTIALS
  do
    if [ -n "${!var:-}" ]; then
      args+=(-e "$var")
    fi
  done
  docker "${args[@]}" "$RESTIC_IMAGE" "$@"
}

# rclone in a container that shares the storage container's network: the S3 port is not published.
# The keys come from the storage container and travel in the environment, not in the command line.
rclone_s3() {
  RCLONE_CONFIG_S3_ACCESS_KEY_ID=$(dc exec -T storage printenv STORAGE_ACCESS_KEY)
  RCLONE_CONFIG_S3_SECRET_ACCESS_KEY=$(dc exec -T storage printenv STORAGE_SECRET_KEY)
  export RCLONE_CONFIG_S3_ACCESS_KEY_ID RCLONE_CONFIG_S3_SECRET_ACCESS_KEY
  docker run --rm --user "$(id -u):$(id -g)" --network "container:$(dc ps -q storage)" \
    -v "$BACKUP_DIR:$BACKUP_DIR" \
    -e RCLONE_CONFIG_S3_ACCESS_KEY_ID -e RCLONE_CONFIG_S3_SECRET_ACCESS_KEY \
    -e RCLONE_CONFIG_S3_TYPE=s3 -e RCLONE_CONFIG_S3_PROVIDER=Other \
    -e RCLONE_CONFIG_S3_ENDPOINT=http://127.0.0.1:8333 \
    "$RCLONE_IMAGE" "$@"
}
