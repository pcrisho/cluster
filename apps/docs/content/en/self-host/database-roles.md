---
title: Database roles
description: How Cluster separates the database owner, the request role, and the system role in PostgreSQL.
section: self-host
order: 4
---

Cluster uses three PostgreSQL roles so the running API never holds schema-owner privileges.

## The three roles

| Role | Purpose | Privileges |
|---|---|---|
| **Database owner (`POSTGRES_USER`)** | Runs migrations and database backups. | Schema owner; used only by the `migrate` service and backup scripts, never by `api`. |
| **Application role** | Handles all authenticated user requests. | Subject to Row-Level Security (`tenant` policies); cannot bypass RLS. |
| **System role** | Handles authentication, background jobs, and superadmin queries. | Data manipulation only (no DDL, owns nothing); permitted to read across organizations where required. |

## How roles are provisioned

- The `migrate` service runs `db:roles` automatically on `docker compose up -d`. It creates or updates the application and system roles using `CLUSTER_APP_PASSWORD` and `CLUSTER_SYSTEM_PASSWORD`.
- `DATABASE_URL` points to the application role, `DATABASE_SYSTEM_URL` points to the system role, and `DATABASE_OWNER_URL` points to `POSTGRES_USER`.

:::note
If you use a managed PostgreSQL provider where superuser privileges are restricted, run `db:roles` once with your provider's admin account before the first `docker compose up -d`. Both `CLUSTER_APP_PASSWORD` and `CLUSTER_SYSTEM_PASSWORD` must be set in `.env` or Docker Compose will refuse to start.
:::
