---
title: Monitoring
description: Health checks, container log rotation, and disk usage alerts for a self-hosted Cluster instance.
section: self-host
order: 9
---

## External health check

Configure an external uptime monitor (from a separate machine or service) to poll `https://<your-domain>/api/v1/health` every 1 to 5 minutes:

- **`200` with `"status":"ok"`**: database, Redis, and object storage all respond.
- **`200` with `"status":"degraded"`**: Redis or object storage did not respond; configure your monitor to alert if the response body contains `degraded`.
- **`503`**: PostgreSQL is unreachable.

Add a second check against your web root URL (`https://<your-domain>/`).

:::note
Docker Compose with `restart: unless-stopped` restarts crashed containers, not containers marked `unhealthy`. External alerts ensure you notice degraded dependencies quickly.
:::

## Container logs

Every service rotates Docker logs locally at 10 MB × 5 files. Inspect recent logs with:

```sh
docker compose logs --tail 100 api
docker compose ps
```

## Disk space alerts

Concurrent video uploads stage temporary files in `UPLOAD_TMP_DIR` (up to 3 × 1 GB), and `api` rejects new uploads with `507` if less than 512 MB remains free. Schedule `scripts/ops/check-disk.sh` via cron to alert when `/`, `/var/lib/docker`, or `UPLOAD_TMP_DIR` exceeds 80%:

```cron
*/15 * * * *  <cluster-dir>/scripts/ops/check-disk.sh || echo "high disk usage on $(hostname)"
```
