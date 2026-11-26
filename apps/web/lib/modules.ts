import type { AuthUser, ModuleKey } from "./api"

/** Every feature module; its description is `modules.<KEY>` in the catalogs. */
export const ALL_MODULES: ModuleKey[] = ["KNOW", "GROW", "CONNECT", "LIFE"]

/** Preferred order of modules: sidebar sections and the post-login home both follow it. */
export const MODULE_ORDER: ModuleKey[] = ["CONNECT", "KNOW", "GROW", "LIFE"]

/** Landing route of each module that has one. */
const MODULE_LANDING: Partial<Record<ModuleKey, string>> = {
  CONNECT: "/connect/feed",
  KNOW: "/know",
  GROW: "/grow",
}

/** Landing route of the first enabled module in MODULE_ORDER; settings when none. */
export function homePath(user: AuthUser): string {
  for (const key of MODULE_ORDER) {
    const route = MODULE_LANDING[key]
    if (route && user.modules.includes(key)) return route
  }
  return user.role === "ADMIN" ? "/settings/organization" : "/settings/account"
}

/** Module that owns a route, or null for core routes (settings, instance…). */
export function moduleForPath(pathname: string): ModuleKey | null {
  const segment = pathname.split("/")[1]?.toUpperCase()
  return ALL_MODULES.includes(segment as ModuleKey)
    ? (segment as ModuleKey)
    : null
}
