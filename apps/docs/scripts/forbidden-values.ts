// Values that must never appear in published docs (design.md §5). Kept out of content/ on purpose.
// Development seed credentials and the development TOTP secret from AGENTS.md; plus the secret
// values of the local .env (read by check-content.ts).
export const FORBIDDEN_VALUES: readonly string[] = [
  "Cluster-demo-2026",
  "Cluster-team-2026",
  "CLUSTERDEMOADMINTOTPSECRETKEY234",
  "admin@cluster.example",
]
