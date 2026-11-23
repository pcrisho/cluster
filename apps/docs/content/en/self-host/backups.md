---
title: Backups and restore
description: Automated backups of PostgreSQL and SeaweedFS with restic, and how to run a restore drill.
section: self-host
order: 5
---

Cluster provides backup and restore scripts in `scripts/backup/` that back up both the PostgreSQL database and the SeaweedFS object storage bucket to an encrypted off-server `restic` repository.

## What is backed up

1. **PostgreSQL database**: dumped with `pg_dump -Fc` as `POSTGRES_USER` from the `postgres` container.
2. **Object storage bucket**: synced with `rclone` from a container sharing the `storage` network.
3. **Encrypted off-server archive**: both are uploaded together using `restic backup` with retention of 7 daily, 4 weekly, and 6 monthly snapshots.

:::warning
Never dump the database with the application role or with `--enable-row-security`: that produces an empty dump of all organization tables. Always keep a copy of your `.env` file in a password manager outside the server—without `AUTH_SECRET_KEY`, users cannot recover their 2FA secrets.
:::

## One-time setup

1. Install `docker`, `flock`, `curl`, and `restic` on the server.
2. Initialize an off-server `restic` repository (`restic init`) and store its password outside the server as well.
3. Create `/etc/cluster-backup.env` (mode `600`) with your repository target (**RESTIC_REPOSITORY**), password file (**RESTIC_PASSWORD_FILE**), working directory (**BACKUP_DIR**, default `/var/backups/cluster`), `STORAGE_BUCKET` matching `.env`, and optionally **BACKUP_PING_URL** for dead-man's-switch alerts.

## Scheduling

Run the backup daily and verify backup age hourly via cron:

```cron
0 3 * * *  cd <cluster-dir> && set -a && . /etc/cluster-backup.env && set +a && scripts/backup/backup.sh >> /var/log/cluster-backup.log 2>&1
17 * * * * cd <cluster-dir> && set -a && . /etc/cluster-backup.env && set +a && scripts/backup/check-backup-age.sh || echo "backup overdue on $(hostname)"
```

Once a month, verify repository integrity with `restic check --read-data-subset=5%`.

## Restore drill

Run a full restore drill on a separate clean machine before inviting users:

:::steps
1. Prepare a clean machine with Docker, `restic`, the matching release tag, your `.env`, and `/etc/cluster-backup.env`.
2. Start only the database and storage services: `docker compose build migrate && docker compose up -d --wait postgres storage`.
3. Run `scripts/backup/restore.sh` (or `restore.sh <snapshot-id>`). It restores the database as `POSTGRES_USER`, recreates the application and system roles, runs `migrate`, and copies the bucket back.
4. Run `docker compose up -d`. Wait until `docker compose ps` reports all services `healthy`.
5. Sign in, open a KNOW page with an image, play and seek a GROW video lesson, and verify a certificate at `/verify/<code>`.
:::
