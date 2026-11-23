# shellcheck shell=bash disable=SC2016 # single quotes on purpose: $POSTGRES_* expand inside the container
# Sourced by backup.sh and restore.sh (not run on its own). Runs from the repository root.
umask 077
cd "$(dirname "$0")/../.." || exit
: "${BACKUP_DIR:=/var/backups/cluster}"
RCLONE_IMAGE=rclone/rclone:1.75.1

dc() { docker compose "$@"; }
# SQL on stdin, as the database owner (never as cluster_app).
psql_owner() { dc exec -T postgres sh -c 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -tA'; }

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
