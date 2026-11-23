import type { AccessKind } from "@/lib/admin-api"

/**
 * Lifetimes an administrator may choose, in hours; the API holds the same presets and refuses others
 * (docs/specs/auth/access-without-mail). A pending member's link is an invitation; an active member's is a reset.
 */
export const LIFETIME_PRESETS = {
  INVITE: [24, 72, 168, 336, 720],
  RESET: [1, 24, 72],
} as const

export const DEFAULT_LIFETIME = { INVITE: 168, RESET: 24 } as const

/** The kinds an administrator can issue for a member: a password only while they have not set one. */
export function accessKindsFor(pending: boolean): AccessKind[] {
  return pending ? ["link", "password"] : ["link"]
}
