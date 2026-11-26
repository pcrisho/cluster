import { AccessRole } from "@prisma/client"
import { roleAtLeast } from "../org/access-role"

export type Need = "READ" | "EDIT" | "MANAGE"

const MINIMUM: Record<Need, AccessRole> = { READ: "VIEWER", EDIT: "EDITOR", MANAGE: "MANAGER" }

/**
 * A user's role in one space; null means the space is invisible to them.
 * `matchedRoles` are the roles of the space's entries that point at the user.
 */
export function spaceRole(input: {
  isAdmin: boolean
  restricted: boolean
  matchedRoles: AccessRole[]
}): AccessRole | null {
  if (input.isAdmin) return "MANAGER"
  const best = input.matchedRoles.reduce<AccessRole | null>(
    (top, role) => (top === null || roleAtLeast(role, top) ? role : top),
    null,
  )
  return best ?? (input.restricted ? null : "VIEWER")
}

export function allows(role: AccessRole | null, need: Need): boolean {
  return roleAtLeast(role, MINIMUM[need])
}

/** Role in every space the user can read: open spaces default to VIEWER, entries can raise it (or open a restricted one). */
export function spaceRoles(
  openSpaceIds: string[],
  entries: { spaceId: string; role: AccessRole }[],
): Map<string, AccessRole> {
  const roles = new Map<string, AccessRole>(openSpaceIds.map((id) => [id, "VIEWER"]))
  for (const { spaceId, role } of entries) {
    const current = roles.get(spaceId) ?? null
    if (current === null || !roleAtLeast(current, role)) roles.set(spaceId, role)
  }
  return roles
}
