# Contributing to Cluster

Thank you for your interest in contributing to Cluster.

## Prerequisites

- **Node.js** `>= 22`
- **pnpm** `>= 9` (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- **Docker** and **Docker Compose**

## Local Development Setup

### 1. Environment & Dependencies

```bash
cp .env.example .env
```

Set `COLLAB_INTERNAL_SECRET` in `.env` (for example `openssl rand -hex 32`). Both `api` and `collab` read it from `.env`; do not export a different value in your shell because shell variables override `.env`.

```bash
pnpm install
```

> On Linux hosts with global `libvips` installed, run `SHARP_IGNORE_GLOBAL_LIBVIPS=1 pnpm install` if `sharp` tries to build from source.

### 2. Start Local Infrastructure

Starts PostgreSQL, Redis, SeaweedFS (`storage`), and Mailpit:

```bash
docker compose -f docker-compose.dev.yml up -d
```

### 3. Initialize Packages & Database

```bash
pnpm --filter @cluster/editor-schema build
pnpm --filter @cluster/theme build
pnpm --filter @cluster/api db:roles
pnpm --filter @cluster/api prisma:migrate
pnpm --filter @cluster/api prisma:seed
```

### 4. Start Dev Servers

```bash
pnpm dev
```

| Service | Local URL | Notes |
|---|---|---|
| **Web (Next.js)** | http://localhost:3000 | App UI |
| **API (NestJS)** | http://localhost:3001 | Health: `/api/v1/health` |
| **Collab (Hocuspocus)** | ws://localhost:3002 | Realtime KNOW editing |
| **Mailpit inbox** | http://localhost:8025 | Captured dev emails |
| **SeaweedFS Master UI** | http://localhost:9333 | Storage admin UI |
| **SeaweedFS S3** | http://localhost:9000 | Private S3 gateway |

### Default Dev Seed Accounts

| Role | Credentials |
|---|---|
| **Superadmin** | `admin@cluster.example` / `Cluster-demo-2026` + TOTP secret `CLUSTERDEMOADMINTOTPSECRETKEY234` |
| **Employees** | `<name>@cluster.example` / `Cluster-team-2026` |

## Commands Reference

Run from the repository root:

```bash
pnpm dev              # Web + API + collab
pnpm api:dev          # API only
pnpm web:dev          # Web only
pnpm collab:dev       # Collab only

pnpm build            # Build all apps and packages
pnpm typecheck        # TypeScript --noEmit across workspaces
pnpm lint             # ESLint + design-token guard (pnpm lint:tokens)
pnpm format           # Prettier formatting
pnpm verify:tokens    # WCAG contrast contract for theme tokens
pnpm test             # Unit tests (Jest)
pnpm test:e2e         # API e2e tests against <POSTGRES_DB>_test
```

### Prisma Helpers

```bash
pnpm --filter @cluster/api prisma:migrate     # Apply dev migrations
pnpm --filter @cluster/api prisma:seed        # Run demo seed
pnpm --filter @cluster/api prisma:generate    # Regenerate Prisma client after schema edits
pnpm --filter @cluster/api prisma:studio      # Prisma Studio UI
pnpm --filter @cluster/api prisma:reset       # Reset dev DB and re-apply migrations
```

Create a new migration after editing `apps/api/prisma/schema.prisma`:

```bash
pnpm --filter @cluster/api exec dotenv -e ../../.env -- prisma migrate dev --name <migration_name>
```

## Coding Standards

- **Module boundaries:** Core modules (`auth`, `org`, `instance`, `mail`, `storage`, `notification`, `collab`) must not import feature modules (`know`, `grow`, `connect`, `life`), and feature modules must not import each other. ESLint enforces this rule.
- **Multi-tenant isolation:** Every organization-scoped endpoint must filter by `organizationId`, rely on PostgreSQL RLS (`cluster_app`), and include an e2e test proving cross-organization isolation.
- **Bilingual copy (EN / ES):** Add any new UI or API copy to both English and Spanish catalogs (`apps/web/messages/{en,es}.json` and `apps/api/src/i18n/{en,es}.ts`).
- **Design tokens:** Use semantic tokens from `globals.css` and `@cluster/theme`. Do not introduce raw Tailwind palette colors, hex values in TSX, or pixel font sizes.
- **Commit style:** Use Conventional Commits (`feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`, `test(...)`).

## Verification Before Opening a Pull Request

Run from the repository root and confirm all checks pass:

```bash
pnpm typecheck
pnpm lint
pnpm test
```

If your changes touch the API, database schema, permissions, or storage, also run the e2e suite against the local Docker dev stack:

```bash
pnpm test:e2e
```

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Keep pull requests focused on one topic with clear descriptions and tests covering the behavior.
3. For UI changes, verify both light and dark themes across desktop and mobile viewports.
4. For schema changes, add a new Prisma migration rather than editing an existing one, and run `pnpm --filter @cluster/api prisma:generate`.
