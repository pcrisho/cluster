import type { AccessRole } from "@/lib/know-api"

/** Editors and managers of a space write in it; managers also change its settings and access. */
export const canEditSpace = (role: AccessRole | undefined) => role === "EDITOR" || role === "MANAGER"
export const canManageSpace = (role: AccessRole | undefined) => role === "MANAGER"

export const ROLES: AccessRole[] = ["VIEWER", "EDITOR", "MANAGER"]

// Names and hints: `know.roles.<ROLE>` and `know.roles.<ROLE>_hint` in the catalogs.
