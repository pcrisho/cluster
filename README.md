<div align="center">
  <br />
  <a href="https://clusterhq.app">
    <img src="https://docs.clusterhq.app/Imagotipo.svg" alt="Cluster" width="64" height="64" />
  </a>
  <h1>Cluster</h1>
  <p><strong>Open-core knowledge base and training platform (LMS) — self-hosted on your own server, in your brand.</strong></p>
  <p>
    <a href="https://clusterhq.app">Website</a> ·
    <a href="https://docs.clusterhq.app">Documentation (EN / ES)</a> ·
    <a href="https://docs.clusterhq.app/en/changelog/0-2-0/">Changelog</a> ·
    <a href="SECURITY.md">Security</a>
  </p>
  <p>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-5e47e8?style=flat-square" alt="MIT License" /></a>
    <a href="https://github.com/pcrisho/cluster/releases/tag/v0.2.0"><img src="https://img.shields.io/badge/release-v0.2.0-5e47e8?style=flat-square" alt="Release v0.2.0" /></a>
    <a href="https://github.com/pcrisho/cluster/actions/workflows/ci.yml"><img src="https://github.com/pcrisho/cluster/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <img src="https://img.shields.io/badge/languages-EN%20%7C%20ES-5e47e8?style=flat-square" alt="Languages EN and ES" />
  </p>
</div>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://docs.clusterhq.app/screenshots/know-page-editor-en-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://docs.clusterhq.app/screenshots/know-page-editor-en-light.png" />
    <img src="https://docs.clusterhq.app/screenshots/know-page-editor-en-light.png" alt="Cluster KNOW collaborative page editor" width="100%" />
  </picture>
</p>

**Cluster** is an Employee Experience Platform (EXP) built to centralize internal documentation, employee training, and company communication in one web app you run on your own infrastructure.

- **Multi-tenant isolation**: PostgreSQL Row-Level Security (`tenant` policy) across all 29 tenant-scoped tables, separate restricted/system DB roles, and private S3 storage served only through authenticated API routes.
- **Bilingual out of the box**: full English and Spanish (neutral Latin American) across the interface, emails, certificate PDFs, and CSV exports.
- **Custom branding**: configurable instance and per-organization colors, typography, corner radius, glass surfaces, and logos with automatic WCAG contrast verification.

### Open core: what is free and what is commercial

Cluster is **open core**.

- **The core is MIT-licensed and free to self-host.** Everything Cluster does today is in this repository: KNOW, GROW, CONNECT, multi-tenant isolation, theming and branding, English and Spanish, and the self-hosting stack.
- **The commercial plan offers managed hosting and support.** You can run Cluster yourself with no fee, or have us run it for you.
- **Planned commercial extras: single sign-on (SSO) and advanced audit.** These do not exist yet. Nothing that works today in this repository will move behind a paywall.

---

## ✨ Platform & Modules

Modules can be enabled or disabled at the instance level and per organization. Disabled modules disappear from navigation and return `403` on the API.

| Module | Status | What it includes | Guide |
|---|---|---|---|
| **KNOW** | Built | Spaces, per-space access roles (`Viewer` / `Editor` / `Manager`), realtime Yjs/Hocuspocus editing, version diffs & restore, Markdown import/export, image/PDF viewer, and search. | [KNOW docs](https://docs.clusterhq.app/en/know/spaces-and-access/) |
| **GROW** | Built | Courses with rich text, links, files, and uploaded MP4/WebM videos (up to 1 GB with HTTP byte-range streaming), quizzes with manual review, mandatory assignments, PDF certificates with public verification, dashboard, and CSV reports. | [GROW docs](https://docs.clusterhq.app/en/grow/courses-and-lessons/) |
| **CONNECT** | Built | Company feed with reactions and comments, searchable member directory, interactive organization chart, and celebrations. | [Features summary](https://docs.clusterhq.app/en/evaluate/features-by-module/) |
| **LIFE** | In preparation | Employee wellbeing and day-to-day workflows (stub module). | [Overview](https://docs.clusterhq.app/en/overview/what-is-cluster/) |

---

## 🚀 Self-Hosting (Docker Compose)

Cluster runs as a single Docker Compose stack (`web`, `api`, `collab`, `postgres`, `redis`, `storage`, and an optional `caddy` TLS profile):

```bash
git clone https://github.com/pcrisho/cluster.git
cd cluster
cp .env.example .env
# Generate secrets (`openssl rand -hex 32`) for JWT_SECRET, AUTH_SECRET_KEY,
# COLLAB_INTERNAL_SECRET, database/Redis passwords, non-default STORAGE_* keys,
# and set your public URLs + CLUSTER_DOMAIN.
docker compose build
docker compose --profile proxy up -d
```

For full production guidance (firewall, external reverse proxy, database roles, automated off-server `restic` backups, and monitoring), follow the self-hosting documentation:

- [Requirements](https://docs.clusterhq.app/en/self-host/requirements/) · [First start checklist](https://docs.clusterhq.app/en/self-host/first-start/) · [Environment variables](https://docs.clusterhq.app/en/self-host/environment/) · [HTTPS & reverse proxy](https://docs.clusterhq.app/en/self-host/proxy/) · [Backups & restore](https://docs.clusterhq.app/en/self-host/backups/)

---

## 📸 Screenshots

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://docs.clusterhq.app/screenshots/grow-learning-en-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://docs.clusterhq.app/screenshots/grow-learning-en-light.png" />
    <img src="https://docs.clusterhq.app/screenshots/grow-learning-en-light.png" alt="GROW My learning and course catalog" width="100%" />
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://docs.clusterhq.app/screenshots/grow-reports-en-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://docs.clusterhq.app/screenshots/grow-reports-en-light.png" />
    <img src="https://docs.clusterhq.app/screenshots/grow-reports-en-light.png" alt="GROW compliance reports and CSV export" width="100%" />
  </picture>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://docs.clusterhq.app/screenshots/admin-areas-en-dark.png" />
    <source media="(prefers-color-scheme: light)" srcset="https://docs.clusterhq.app/screenshots/admin-areas-en-light.png" />
    <img src="https://docs.clusterhq.app/screenshots/admin-areas-en-light.png" alt="Organization area tree and assignments" width="100%" />
  </picture>
</p>

---

## 🏗️ Architecture

Cluster is a modular monolith (`apps/api`, `apps/web`) paired with a lightweight Hocuspocus realtime collaboration server (`apps/collab`) and shared domain packages (`packages/editor-schema`, `packages/theme`).

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://docs.clusterhq.app/diagrams/cluster-deployment-en-dark.svg" />
    <source media="(prefers-color-scheme: light)" srcset="https://docs.clusterhq.app/diagrams/cluster-deployment-en-light.svg" />
    <img src="https://docs.clusterhq.app/diagrams/cluster-deployment-en-light.svg" alt="Cluster deployment architecture diagram" width="100%" />
  </picture>
</p>

Read more in [Architecture and services](https://docs.clusterhq.app/en/overview/modules-and-architecture/) and [Data isolation](https://docs.clusterhq.app/en/evaluate/data-isolation/).

---

## ⚙️ Built With

[![Next.js 16](https://img.shields.io/badge/Next.js%2016-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![NestJS 11](https://img.shields.io/badge/NestJS%2011-E0234E?style=flat-square&logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![PostgreSQL 16](https://img.shields.io/badge/PostgreSQL%2016-4169E1?style=flat-square&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Prisma 7](https://img.shields.io/badge/Prisma%207-2D3748?style=flat-square&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Redis 7](https://img.shields.io/badge/Redis%207-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io/)
[![SeaweedFS](https://img.shields.io/badge/SeaweedFS%20S3-5e47e8?style=flat-square)](https://seaweedfs.com/)
[![Yjs / Hocuspocus](https://img.shields.io/badge/Yjs%20%2F%20Hocuspocus-18181b?style=flat-square)](https://tiptap.dev/product/hocuspocus)
[![Tailwind CSS 4](https://img.shields.io/badge/Tailwind%20CSS%204-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white)](https://www.docker.com/)

---

## 🛠️ Local Development

Requires **Node.js >= 24.22.3**, **pnpm 10**, and **Docker**.

```bash
cp .env.example .env                             # set COLLAB_INTERNAL_SECRET (e.g. `openssl rand -hex 32`)
pnpm install
docker compose -f docker-compose.dev.yml up -d   # Postgres, Redis, SeaweedFS, Mailpit
pnpm --filter @cluster/editor-schema build
pnpm --filter @cluster/theme build
pnpm --filter @cluster/api db:roles
pnpm --filter @cluster/api prisma:migrate
pnpm --filter @cluster/api prisma:seed
pnpm dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for local service URLs, demo credentials, Prisma helpers, unit/e2e test suites, and coding conventions.

---

## 📝 Documentation, Security & License

- **Documentation**: full evaluation, self-hosting, and user guides (EN / ES) at [docs.clusterhq.app](https://docs.clusterhq.app).
- **Security**: report vulnerabilities privately to [security@clusterhq.app](mailto:security@clusterhq.app) (initial response within 72 hours) — see [SECURITY.md](SECURITY.md).
- **Contributing**: pull request checklist, module boundaries, and testing rules in [CONTRIBUTING.md](CONTRIBUTING.md). Participation is covered by our [Code of Conduct](CODE_OF_CONDUCT.md).
- **License**: [MIT](LICENSE).
