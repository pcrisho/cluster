---
title: Updating Cluster
description: How to back up, pull a new release tag, migrate the database, and roll back safely if needed.
section: self-host
order: 3
---

Always take a manual database backup before upgrading to a new release tag.

## Upgrade steps

:::steps
1. **Take a manual backup** as the database owner (never with `--enable-row-security`):

   ```sh
   docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > cluster-$(date +%F-%H%M).dump
   ```

   Copy the `.dump` file off the server.
2. **Note the current tag** in case you need to roll back: `git describe --tags`.
3. **Fetch and check out the new release**: `git fetch --tags && git checkout <new-tag>`.
4. **Rebuild images**: run `docker compose build`. If any `NEXT_PUBLIC_*` variable changed, the web image must be rebuilt.
5. **Apply migrations and restart**: run `docker compose up -d`. The `migrate` service runs once, updates database roles, applies Prisma migrations, and exits before `api` starts. If it fails, inspect `docker compose logs migrate`.
6. **Verify health**: confirm `https://<your-domain>/api/v1/health` returns `ok`, all services in `docker compose ps` are `healthy`, and review `docker compose logs api --tail 100`.
7. **Run a smoke check** with a real account: sign in (with 2FA if enabled), open a KNOW page with an image, play and seek a GROW video lesson, and verify a certificate at `/verify/<code>`.
:::

## Rolling back

1. Check whether a migration ran: `docker compose logs migrate | grep -i migration`.
2. **If no migration ran**: check out the previous tag, run `docker compose build`, then `docker compose up -d`.
3. **If a migration ran**: the older code may not match the new schema. Restore the backup taken in step 1:

   ```sh
   git checkout <previous-tag>
   docker compose stop api
   docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < cluster-<date>.dump
   docker compose build && docker compose up -d
   ```

:::warning
Any data written between the backup and the restore is lost. Never run storage sweep commands with `--apply` against a database restored from an older backup than the object storage bucket.
:::
