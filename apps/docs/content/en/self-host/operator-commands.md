---
title: Operator commands
description: Maintenance scripts inside the API container for 2FA resets, access links, and storage or auth cleanup.
section: self-host
order: 8
---

Operator commands run inside the `api` container using the system database role. No `pnpm` installation or repository checkout is required inside the container.

## Available commands

| Task | Command |
|---|---|
| Reset a user's 2FA (including superadmin) | `docker compose exec api node dist/scripts/reset-mfa.js <email>` |
| Issue a one-time invite or reset link | `docker compose exec api node dist/scripts/access-link.js <email> [--hours N]` |
| List orphan page/space images | `docker compose exec api node dist/scripts/sweep-page-images.js` |
| Delete orphan page/space images | `docker compose exec api node dist/scripts/sweep-page-images.js --apply` |
| List orphan GROW lesson files/videos | `docker compose exec api node dist/scripts/sweep-lesson-files.js` |
| Delete orphan GROW lesson files/videos | `docker compose exec api node dist/scripts/sweep-lesson-files.js --apply` |
| List expired auth rows | `docker compose exec api node dist/scripts/sweep-auth.js` |
| Delete expired auth rows | `docker compose exec api node dist/scripts/sweep-auth.js --apply` |

## Behaviour and flags

- **`reset-mfa`**: clears 2FA and recovery codes, revokes active sessions for that account, and logs an auth event. The user must re-enroll 2FA on next sign-in.
- **`access-link`**: prints a single-use invite link (default 7 days; `--hours` `24`, `72`, `168`, `336`, or `720`) or password-reset link (default 24 h; `1`, `24`, or `72`). Share it only with that person.
- **Sweep commands**: without `--apply`, they run in dry-run mode and only print counts or keys. They always skip items newer than one hour.

:::warning
Passing `--apply` permanently deletes unreferenced files or expired auth rows. Always run without `--apply` first, and never run storage sweeps with `--apply` against a database restored from an older backup than the bucket.
:::

## Scheduled cleanup

```cron
0 3 * * 0  cd <cluster-dir> && docker compose exec -T api node dist/scripts/sweep-lesson-files.js --apply >> /var/log/cluster-sweep.log 2>&1
30 3 * * * cd <cluster-dir> && docker compose exec -T api node dist/scripts/sweep-auth.js --apply >> /var/log/cluster-sweep.log 2>&1
```
