## What and why

<!-- What does this change, and why? Link the issue (Fixes #123). -->

## How it was tested

- [ ] `pnpm typecheck`
- [ ] `pnpm lint`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e` (if the API changed)
- [ ] Checked in a browser (if the UI changed)

## Checklist

- [ ] New UI or API text has keys in both `en` and `es` catalogs
- [ ] Schema changes come with a new Prisma migration (no edits to applied ones)
- [ ] Org-scoped endpoints filter by organization and have an isolation e2e
- [ ] No secrets or personal data in the diff
