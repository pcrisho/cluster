import { AccessRole } from "@prisma/client"

const RANK: Record<AccessRole, number> = { VIEWER: 1, EDITOR: 2, MANAGER: 3 }

/** The strongest of the roles, or null when there are none. */
export function maxRole(roles: AccessRole[]): AccessRole | null {
  return roles.reduce<AccessRole | null>((best, r) => (best === null || RANK[r] > RANK[best] ? r : best), null)
}

export function roleAtLeast(role: AccessRole | null, minimum: AccessRole): boolean {
  return role !== null && RANK[role] >= RANK[minimum]
}
