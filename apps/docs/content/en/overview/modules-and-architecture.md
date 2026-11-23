---
title: Architecture and services
description: How Cluster's web app, API, realtime collaboration server, database, and object storage fit together.
section: overview
order: 2
---

A running Cluster instance is composed of a small set of standard services orchestrated with Docker Compose.

## What runs where

| Service | Role |
|---|---|
| **Web (`web`)** | Next.js application serving the interface for KNOW, GROW, CONNECT, Account, and Settings. |
| **API (`api`)** | NestJS backend handling authentication, organization structure, permissions, courses, files, and reports. |
| **Collab (`collab`)** | Hocuspocus realtime server for concurrent editing in KNOW spaces and pages. |
| **PostgreSQL (`postgres`)** | Primary database storing organizations, users, pages, courses, and audit logs with Row-Level Security. |
| **SeaweedFS (`seaweedfs`)** | S3-compatible object storage for uploaded images, documents, videos, and organization logos. |
| **Mail (`mailpit` in dev / SMTP in prod)** | Outgoing email for member invitations, password links, and security notifications. |

## Core vs. feature modules

- **Core** includes authentication (`auth`), organization management (`org`), instance administration (`instance`), and file storage (`storage`). Core never depends on feature modules.
- **Feature modules** (`KNOW`, `GROW`, `CONNECT`, `LIFE`) can be enabled or disabled per organization by an administrator. Disabling a module hides it from navigation and blocks its API routes for that organization.

## Static apps

Alongside the main platform, the monorepo includes two standalone static sites:

- **Public site**: marketing and demo landing page.
- **Public documentation**: this documentation site, exported as static HTML with client-side search.
