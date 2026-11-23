---
title: Troubleshooting
description: Common problems on a self-hosted Cluster instance, what causes them, and how to fix them with Docker Compose.
section: self-host
order: 10
---

Start with the state of the stack: `docker compose ps` shows every service and its health, and `docker compose logs api --tail 100` (or another service name) shows its recent log. If you use the bundled Caddy, add `--profile proxy` to these commands.

## Docker Compose refuses to start

Compose stops with a message such as "set COLLAB_INTERNAL_SECRET in .env" when a required value is empty. The required values are `COLLAB_INTERNAL_SECRET`, `REDIS_PASSWORD`, `CLUSTER_APP_PASSWORD` and `CLUSTER_SYSTEM_PASSWORD`. Set them in `.env` (secrets with `openssl rand -hex 32`) and start the stack again with `docker compose up -d`. An older `.env` may be missing `CLUSTER_SYSTEM_PASSWORD`: add it before updating.

## The API does not start

- **The `migrate` job failed.** The API starts only after it succeeds. Read `docker compose logs migrate`. On a managed PostgreSQL, the job needs an administrator account that can grant the right to bypass row-level security; see [Database roles](/en/self-host/database-roles/).
- **A database role is unsafe.** The API checks both of its database roles when it starts and refuses to run if one has more rights than it should. Start the stack with `docker compose up -d` (the `migrate` job recreates the roles), then check `docker compose logs api`.
- **After a restore.** Database roles are not part of a single-database backup. The `migrate` job recreates them on the next `docker compose up -d`.

## The health check says "degraded"

`/api/v1/health` answers 200 with `"status":"degraded"` when Redis or storage do not answer, and 503 when PostgreSQL is down. The `checks` field says which one. Look at `docker compose logs redis` or `docker compose logs storage`, and restart the service with `docker compose restart storage` (or `redis`) if the cause is not clear. Docker restarts a container that exits, not one marked unhealthy, so an external check is what tells you.

## People are signed out or images do not load

The session cookie is sent only to the same site, and only over HTTPS when `WEB_URL` starts with `https://`.

- Serve the web app and the API from the same site: one domain (`app.example.com` with the API under `/api`) or subdomains of one domain (`app.example.com` and `api.example.com`). Two unrelated domains do not work.
- `WEB_URL` must be the exact address people open in the browser. Sign-in and session requests from another origin are refused.
- The `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL` and `NEXT_PUBLIC_COLLAB_URL` values are built into the web image. After changing any of them, run `docker compose build` and `docker compose up -d`.

## Live editing shows "Offline" or "permission-denied"

- **"Offline"**: the browser cannot reach `collab`. Check `docker compose ps` and that your proxy forwards `/collab/` as a WebSocket (see [HTTPS and reverse proxy](/en/self-host/proxy/)). Also check that the browser's origin is listed in `COLLAB_ALLOWED_ORIGINS` and that `NEXT_PUBLIC_COLLAB_URL` uses `wss://` behind HTTPS. Pages stay readable and editable without live editing.
- **"permission-denied" for everyone**: the API and `collab` do not share the same `COLLAB_INTERNAL_SECRET`. Compose passes one value to both. A value exported in your shell wins over `.env`, so make sure your shell does not set a different one, then run `docker compose up -d`.

## Everyone hits the rate limit at once

Behind a reverse proxy, the API sees the proxy's address for every request unless `TRUST_PROXY` is set. Set it to the number of proxies in front of the API (`1` behind the bundled Caddy or one nginx) and restart with `docker compose up -d`.

## Email does not arrive

- An empty `SMTP_HOST` turns email off: nothing is sent. Administrators hand over access links from **Settings → Members**, or you print one with the `access-link` [operator command](/en/self-host/operator-commands/).
- Otherwise, check `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM`, publish SPF and DKIM records for the sender's domain, and look for mail errors in `docker compose logs api`.

## A video upload is refused

- "Other files are being uploaded": up to 3 videos are received at once. Try again when one finishes.
- "The server has no room for this file": the temporary folder (`UPLOAD_TMP_DIR`, or the system temporary folder when empty) would be left with less than 512 MB free. Point `UPLOAD_TMP_DIR` at a disk with room (in Docker, a mounted volume).
- The upload stops partway with your own proxy: the video route needs a body limit of about 1100 MB, request buffering off and a read timeout of one hour. See [HTTPS and reverse proxy](/en/self-host/proxy/).

## Someone lost access to two-step verification

- A person who lost their device and recovery codes: an administrator resets their 2FA from **Settings → Members**.
- The superadmin, or anyone when no administrator can help: run the `reset-mfa` [operator command](/en/self-host/operator-commands/).
- Changing `AUTH_SECRET_KEY` makes every enrolled authenticator app stop working. Keep it unchanged; if it was changed, reset 2FA for the people affected.
