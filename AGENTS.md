# Cluster — Agent & Contributor Guide

This guide summarizes the architecture, commands, boundaries, and verification rules for coding agents and contributors working in this repository.

## Monorepo Layout

```text
apps/
  api/          # NestJS 11 REST + Socket.IO API, Prisma 7, PostgreSQL 16 (RLS)
  web/          # Next.js 16 App Router frontend (shadcn/ui, Tailwind CSS 4)
  collab/       # Realtime collaborative editing service (Node 22, Hocuspocus + Yjs)
packages/
  editor-schema/ # Shared rich-text document schema, validation, Markdown conversion, file-type catalog
  theme/         # Design-token contrast contract, OKLCH theme derivation, glass levels
docker/         # Production Dockerfiles, Caddyfile, SeaweedFS startup
scripts/        # Backup (restic), operational checks, and performance/load scripts
```

## Quick Start

```sh
cp .env.example .env
# Set COLLAB_INTERNAL_SECRET and AUTH_SECRET_KEY in .env (e.g. `openssl rand -hex 32`)
pnpm install
pnpm --filter @cluster/editor-schema build
pnpm --filter @cluster/theme build
docker compose -f docker-compose.dev.yml up -d
pnpm --filter @cluster/api db:roles
pnpm --filter @cluster/api prisma:migrate
pnpm --filter @cluster/api prisma:seed
pnpm dev
```

| Service | Local URL |
| --- | --- |
| Web (Next.js) | http://localhost:3000 |
| API (NestJS) | http://localhost:3001 |
| Collab (Hocuspocus) | ws://localhost:3002 |
| Mailpit inbox | http://localhost:8025 |
| SeaweedFS Master UI | http://localhost:9333 |

Default dev seed: organization `cluster` (`admin@cluster.example` / `Cluster-demo-2026`, dev TOTP secret `CLUSTERDEMOADMINTOTPSECRETKEY234`; employees `<name>@cluster.example` / `Cluster-team-2026`).

## Commands

Run from the repository root:

| Command | Purpose |
| --- | --- |
| `pnpm dev` | Run API, Web and Collab concurrently |
| `pnpm api:dev` / `pnpm web:dev` / `pnpm collab:dev` | Run a single app |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | TypeScript `--noEmit` across the workspace |
| `pnpm lint` | ESLint across all apps (includes module boundaries, RLS allowlist, and token guard) |
| `pnpm lint:tokens` | Design-token guard in `apps/web` (no new raw palette, hex in TSX, pixel font sizes, or hand-placed loaders) |
| `pnpm verify:tokens` | WCAG contrast verification of every colour-token pair in light and dark themes |
| `pnpm test` | Unit tests (Jest) across all packages and apps |
| `pnpm test:e2e` | API e2e tests against real Postgres, Redis, SeaweedFS and Mailpit |

### Prisma

```sh
pnpm --filter @cluster/api prisma:migrate    # Apply migrations (does not seed)
pnpm --filter @cluster/api prisma:generate   # Regenerate Prisma 7 client after schema edits
pnpm --filter @cluster/api prisma:seed       # Seed demo data
pnpm --filter @cluster/api prisma:studio     # Open Prisma Studio
```

## Architecture & Guardrails

- **Module boundaries (ESLint-enforced):** Core modules (`auth`, `org`, `instance`, `mail`, `storage`, `notification`, `collab`) never import feature modules (`know` + `documents`, `grow`, `connect`, `life`), and feature modules never import each other.
- **PostgreSQL Row-Level Security (RLS):**
  - The API connects as `cluster_app` (`DATABASE_URL`, `NOBYPASSRLS`) for all tenant-scoped traffic.
  - `SystemPrismaService` connects as `cluster_system` (`DATABASE_SYSTEM_URL`, `BYPASSRLS`, DML only) and may only be imported by files listed in `SYSTEM_PRISMA_ALLOWED` in `apps/api/eslint.config.mjs`.
  - Migrations, seeds and backups use `DATABASE_OWNER_URL`, which never enters the API container.
- **Access control:** Enforce on the API using `@RequireModule`, `@Roles`, `@SuperAdminOnly`, `@Public`, and resource-level services (`SpaceAccessService`, `CourseAccessService`). Every organization-scoped route must have an e2e test proving another organization cannot read or modify its data.
- **Internationalization (EN / ES):** All user-facing copy lives in `apps/web/messages/{en,es}.json` and `apps/api/src/i18n/{en,es}.ts`. Product and module names (`Cluster`, `CONNECT`, `KNOW`, `GROW`, `LIFE`) are not translated.
- **Design tokens:** Use semantic CSS tokens from `globals.css` and `@cluster/theme`. Any token change in `apps/web/app/globals.css` must be mirrored to `packages/theme/src/base.ts` (enforced by drift tests).
- **Formatting:** Prettier (`pnpm format`) with no semicolons, double quotes, trailing commas. API imports must be relative (no `src/...` absolute paths).
- **Security:** Never commit secrets or `.env`.
