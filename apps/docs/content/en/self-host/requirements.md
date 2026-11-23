---
title: Requirements
description: What a server needs to run Cluster with Docker Compose, which services it starts, which ports it uses, and measured sizing.
section: self-host
order: 1
---

Cluster runs as a set of containers described in `docker-compose.yml`. This page lists what the server needs before you follow [First start](/en/self-host/first-start/).

## Server

- A Linux server with Docker Engine and Docker Compose v2.
- A checkout of the Cluster repository at a release tag. `docker compose build` builds the images on the server, so you do not need Node.js or pnpm on the host: the images carry their own runtime.
- A domain or subdomain pointing at the server. The web app and the API must be served from the same site (one domain, or subdomains of one domain) over HTTPS, or nobody stays signed in. See [HTTPS and reverse proxy](/en/self-host/proxy/).
- Optional: an SMTP account for invitations, password links and security emails. Without one, Cluster sends no email and administrators hand over access links instead.

## Services

The stack starts these services with `docker compose up -d`. Nothing outside the server is required: the database, the cache and file storage all run in the stack.

| Service | What it is | Notes |
|---|---|---|
| `postgres` | PostgreSQL 16 | All data. Volume `postgres-data`. |
| `redis` | Redis 7.4 | Rate-limit counters only; losing them weakens nothing. Requires `REDIS_PASSWORD`. |
| `storage` | SeaweedFS, S3-compatible object storage | Uploaded files and images. Volume `storage-data`. The browser never reaches it directly. |
| `migrate` | One-shot job | Creates the database roles and applies migrations, then exits. The only container with the database owner's credentials. |
| `api` | The Cluster API | Starts after `migrate` succeeds. |
| `web` | The web app | Starts when `api` is healthy. |
| `collab` | Realtime editing service | Requires `COLLAB_INTERNAL_SECRET`, the same value the API uses. |
| `caddy` | Optional TLS proxy | Only with `--profile proxy`. Gets and renews the certificate. |

## Ports

| Port | Bound to | Used by |
|---|---|---|
| 80, 443 (TCP) and 443 (UDP) | All interfaces | `caddy`, or your own reverse proxy |
| 3000 | `127.0.0.1` | `web` (default of `WEB_PORT`) |
| 3001 | `127.0.0.1` | `api` (default of `API_PORT`) |
| 3002 | `127.0.0.1` | `collab` (default of `COLLAB_PORT`) |

PostgreSQL, Redis and storage publish no port; they are reachable only inside the Compose network. Open only SSH, 80 and 443 in the server firewall.

## Memory and CPU limits in the stack

The Compose file caps `api` at 1 CPU and `API_MEMORY_LIMIT` (1 GB by default; lesson video uploads and playback need more than 512 MB), and `web` and `collab` at 1 CPU and 512 MB each. PostgreSQL, Redis and storage have no limits.

## Measured sizing

One load test was run with the whole stack pinned to a fixed number of cores and memory, using synthetic users on a fast desktop core (4.8 GHz). Each simulated person kept live connections open and acted every 15 seconds (ordinary use) or every 5 seconds (intensive use): opening pages and images, the learning screens, the directory and search. It did not include a large GROW dataset (many courses, assignments and reports).

| Limits | Ordinary use | Intensive use |
|---|---|---|
| 1 CPU, 2 GB | about 150 people | 75 to 100 people |
| 2 CPU, 4 GB | 500 people, and still coping | 150 to 200 people |

- A cloud vCPU can be up to twice as slow as the core used in the test. Treat these figures as a starting point and measure on your own server.
- Signing in is the most expensive action. In the same test, 100 people signing in in the same second took about 20 seconds on 2 CPU; 100 people signing in over one minute was fine.
- The memory of the whole stack peaked between 570 and 930 MB in every run.

## Disk

Stored files grow the most: images up to 20 MB, documents up to 50 MB and uploaded lesson videos up to 1 GB each. Text pages are small. Plan room for:

- The PostgreSQL and storage volumes, and their backups (see [Backups and restore](/en/self-host/backups/)).
- The container images and the build.
- The temporary folder for uploads (`UPLOAD_TMP_DIR`, or the system temporary folder when empty): up to 3 videos of 1 GB can be in flight at once, and the API refuses an upload that would leave less than 512 MB free there.
