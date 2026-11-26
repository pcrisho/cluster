/**
 * True when the JWT is missing, malformed, has no numeric `exp`, or expires within `marginMs`.
 * The signature is not checked here: the server verifies it; this only decides when to refresh.
 */
export function isTokenExpiring(
  token: string | null,
  nowMs: number,
  marginMs: number
): boolean {
  const exp = readExp(token)
  if (exp === null) return true
  return exp * 1000 - nowMs <= marginMs
}

function readExp(token: string | null): number | null {
  const payload = token?.split(".")[1]
  if (!payload) return null
  try {
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4)
    const claims = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof claims.exp === "number" ? claims.exp : null
  } catch {
    return null
  }
}
