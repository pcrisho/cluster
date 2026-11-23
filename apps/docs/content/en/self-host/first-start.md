---
title: First start
description: Pre-launch checklist to complete on your server before inviting anyone to a self-hosted Cluster instance.
section: self-host
order: 2
---

This checklist covers everything you should verify on your server before inviting your first organization or users.

Check the server against [Requirements](/en/self-host/requirements/) first. If something goes wrong along the way, see [Troubleshooting](/en/self-host/troubleshooting/).

## Pre-launch checklist

:::steps
1. **Complete your `.env` file**: generate unique 32-byte hex secrets (`openssl rand -hex 32`) for `JWT_SECRET`, `AUTH_SECRET_KEY` (different from `JWT_SECRET`), `COLLAB_INTERNAL_SECRET`, `CLUSTER_APP_PASSWORD`, `CLUSTER_SYSTEM_PASSWORD`, and `POSTGRES_PASSWORD`.
2. **Set public URLs and proxy trust**: configure `WEB_URL`, `WS_CORS_ORIGIN`, `COLLAB_ALLOWED_ORIGINS`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_COLLAB_URL`, and `TRUST_PROXY` (`1` behind a reverse proxy). Web and API must share the same site over HTTPS so session cookies work.
3. **Configure the superadmin**: set `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, and `SUPERADMIN_ORG_NAME` before the first start. The API creates the superadmin on boot if it does not exist.
4. **Lock down the firewall**: allow only SSH, port 80, and port 443. Ports 3000, 3001, and 3002 bind to `127.0.0.1` only.
5. **Start the stack**: run `docker compose build` and `docker compose up -d` (add `--profile proxy` if you use the included Caddy proxy).
6. **Verify health and internal routes**: confirm `https://<your-domain>/api/v1/health` returns `{"status":"ok",...}` and that `/api/v1/internal/collab/x` and `/collab/health` return `404` from outside.
7. **Configure instance settings**: sign in as the superadmin, open **Settings → Instance**, close public sign-ups if private, and enable only the modules you need (for example, KNOW and GROW).
8. **Enable 2FA on the superadmin**: open **Account**, scan the QR code with an authenticator app, and store the recovery codes outside the server.
9. **Test email (if configured)**: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM`, publish SPF/DKIM records, and invite a test account to confirm delivery.
10. **Set up backups and monitoring**: configure automated backups and an external health check before inviting users.
:::

:::warning
Never invite production users before completing a backup and a restore drill on a separate machine.
:::
