---
title: Data isolation
description: How Cluster separates organizations at the database, API, file storage, and realtime layers.
section: evaluate
order: 2
---

Cluster supports multiple organizations in a single instance while keeping each organization's data strictly isolated.

## Database Row-Level Security (RLS)

All tenant-scoped tables in PostgreSQL enforce a Row-Level Security (`tenant`) policy.

- **Request role**: every HTTP request from a signed-in user runs under a restricted database role that cannot bypass Row-Level Security. PostgreSQL itself rejects queries or writes that do not match the active organization context.
- **System role**: background jobs, authentication flows, and cross-organization superadmin operations use a separate, non-owner database role reserved for system operations.

## API and module boundaries

- **Organization scoping**: every tenant endpoint derives the organization from the authenticated session and filters queries accordingly.
- **Module guards**: routes belonging to a disabled module return an error and cannot be accessed by members of that organization.
- **Role and capability checks**: organization administrators, moderators, area managers, and space-level roles (`viewer`, `editor`, `manager`) are checked on every mutation and read.

## File storage isolation

Uploaded files are stored in SeaweedFS under organization-scoped keys and are never served as public bucket URLs.

- Reading a stored file requires an authenticated session and verified access to the parent KNOW page, KNOW space, or GROW course.
- Video streams support HTTP byte-range requests (`206 Partial Content`) only after access to the course is verified.

## Realtime collaboration isolation

WebSocket connections to the `collab` service authenticate with short-lived tokens issued by the API for a specific document and user. Revoking a person's access to a KNOW space or page immediately disconnects their active editing session.
