# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Cluster, please report it responsibly by emailing:

- **Security contact:** `security@clusterhq.app`

Please do **not** open a public GitHub issue for security vulnerabilities. Include a clear description of the issue, steps to reproduce, and potential impact. You can expect an initial acknowledgment within 72 hours.

## Security Architecture Highlights

Cluster is designed for self-hosted, multi-tenant corporate environments with defense in depth:

- **PostgreSQL Row-Level Security (RLS):** Tenant policies enforced across 28 organization-scoped tables with separate `cluster_app` (`NOBYPASSRLS`) and `cluster_system` (DML-only, ESLint-allowlisted) database roles. The table owner role is never exposed to the API container.
- **Hardened Authentication:** Short-lived JWT access tokens in memory, Postgres-backed opaque refresh sessions (`httpOnly`, `SameSite=Strict`), TOTP 2FA with recovery codes, Entra-style progressive lockout, uniform sign-in timings, and security notification emails.
- **Content Security Policy (CSP):** Per-request nonce CSP served by the Next.js proxy.
- **Private Storage & File Validation:** Private S3 bucket (SeaweedFS) served exclusively through authenticated API routes with magic-byte content validation and per-resource access checks.
