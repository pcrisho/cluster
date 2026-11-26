const trimSlash = (value: string) => value.trim().replace(/\/+$/, "")

/** Exact match against the allowed list; a missing or empty Origin is refused. */
export function isAllowedOrigin(
  origin: string | undefined,
  allowed: string[]
): boolean {
  if (!origin) return false
  const normalized = trimSlash(origin)
  if (normalized === "") return false
  return allowed.some((entry) => trimSlash(entry) === normalized)
}
