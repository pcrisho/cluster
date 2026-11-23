---
title: Environment variables
description: Reference of the environment variables in .env.example used to configure a self-hosted Cluster instance.
section: self-host
order: 6
---

Cluster reads its runtime and build configuration from `.env` at the repository root (based on `.env.example`).

## Database and roles

| Variable | Purpose |
|---|---|
| `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | PostgreSQL connection and schema owner credentials. |
| `CLUSTER_APP_PASSWORD`, `CLUSTER_SYSTEM_PASSWORD` | Passwords for the application and system database roles created by `migrate`. |
| `DATABASE_URL`, `DATABASE_SYSTEM_URL`, `DATABASE_OWNER_URL` | Connection strings for the API request client, system client, and migrations. |

## Secrets and authentication

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs access tokens; in production must be random and at least 32 characters (`openssl rand -hex 32`). |
| `JWT_SECRET_PREVIOUS` | Optional previous signing secret for zero-downtime key rotation. |
| `AUTH_SECRET_KEY` | Seals 2FA secrets (must differ from `JWT_SECRET`). |
| `AUTH_EVENTS_RETENTION_DAYS` | Retention window for `auth_events` cleaned by `sweep-auth` (default `365`). |
| `COLLAB_INTERNAL_SECRET` | Shared secret between `api` and `collab` (`openssl rand -hex 32`). |

## Public URLs and proxy

| Variable | Purpose |
|---|---|
| `WEB_URL` | Public web URL used in email links and `Secure` cookie flags. |
| `WS_CORS_ORIGIN` | Allowed browser origin for API CORS and WebSockets. |
| `COLLAB_ALLOWED_ORIGINS` | Comma-separated origins allowed to connect to `collab`. |
| `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_COLLAB_URL` | Public URLs baked into the `web` image at build time (`https://` and `wss://` in production). |
| `TRUST_PROXY` | Number of reverse proxies in front of `api` (set to `1` behind Caddy or nginx). |

## Storage, uploads, and Redis

| Variable | Purpose |
|---|---|
| `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `REDIS_URL` | Redis connection for rate-limit counters. |
| `STORAGE_HOST`, `STORAGE_PORT`, `STORAGE_MASTER_PORT`, `STORAGE_USE_SSL` | Internal SeaweedFS S3 endpoint used by `api`. |
| `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | Bucket name and credentials (non-default keys required in production). |
| `UPLOAD_TMP_DIR` | Temporary directory for in-flight video uploads (up to 3 × 1 GB concurrently). |
| `API_MEMORY_LIMIT` | Container memory limit for `api` (default `1g`). |
| `COLLAB_URL`, `COLLAB_API_URL`, `COLLAB_PORT`, `COLLAB_MAX_DOC_BYTES` | Internal URLs, port, and maximum document size for `collab`. |

## Mail and initial superadmin

| Variable | Purpose |
|---|---|
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing SMTP configuration; leave `SMTP_HOST` empty to disable email. |
| `MAIL_INVITES_PER_MINUTE` | Rate limit for queued area invitations (`0` pauses the queue). |
| `SUPERADMIN_EMAIL`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_ORG_NAME` | Initial superadmin and organization created on first boot if none exist. |
