# Contributing to Cluster

Thank you for your interest in contributing to Cluster.

## Development Setup

See the [Getting Started](README.md#getting-started) section in `README.md` to configure `.env`, start the local Docker services (PostgreSQL, Redis, SeaweedFS, Mailpit), initialize database roles/migrations, and run the apps.

## Coding Standards

- **Module boundaries:** Core modules (`auth`, `org`, `instance`, `mail`, `storage`, `notification`, `collab`) must not import feature modules (`know`, `grow`, `connect`, `life`), and feature modules must not import each other. ESLint enforces this rule.
- **Multi-tenant isolation:** Every organization-scoped endpoint must filter by `organizationId`, rely on PostgreSQL RLS (`cluster_app`), and include an e2e test proving cross-organization isolation.
- **Bilingual copy (EN / ES):** Add any new UI or API copy to both English and Spanish catalogs (`apps/web/messages/{en,es}.json` and `apps/api/src/i18n/{en,es}.ts`).
- **Design tokens:** Use semantic tokens from `globals.css` and `@cluster/theme`. Do not introduce raw Tailwind palette colors, hex values in TSX, or pixel font sizes.
- **Commit style:** Use Conventional Commits (`feat(...)`, `fix(...)`, `docs(...)`, `chore(...)`, `test(...)`).

## Verification Before Opening a Pull Request

Run the following checks from the repository root and make sure they pass:

```sh
pnpm typecheck
pnpm lint
pnpm test
```

If your changes touch the API, database schema, permissions, or storage, also run the e2e suite against the local Docker dev stack:

```sh
pnpm test:e2e
```

## Pull Request Process

1. Fork the repository and create a branch from `main`.
2. Keep pull requests focused on one topic with clear descriptions and tests covering the behavior.
3. For UI changes, verify both light and dark themes across desktop and mobile viewports.
4. For schema changes, add a new Prisma migration rather than editing an existing one.
