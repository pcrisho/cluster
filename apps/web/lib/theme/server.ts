import { cookies } from "next/headers"
import {
  parseGlass,
  parseSeeds,
  resolveSeeds,
  themeCss,
  type GlassKey,
  type Seeds,
} from "@cluster/theme"
import { THEME_COOKIE } from "./theme-cookie"

const API_URL =
  process.env.API_INTERNAL_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:3001/api/v1"

const NONE: Seeds = {
  brandPrimary: null,
  brandSecondary: null,
  fontKey: null,
  radiusKey: null,
}

/** The organization layer, from the `cluster_theme` cookie ({p,s,f,r}, already URL-decoded by Next); anything unreadable is no layer. */
function cookieSeeds(cookie: string | undefined): Seeds | null {
  if (!cookie) return null
  try {
    const c: unknown = JSON.parse(cookie)
    if (typeof c !== "object" || c === null) return null
    const { p, s, f, r } = c as Record<string, unknown>
    return parseSeeds({
      brandPrimary: p,
      brandSecondary: s,
      fontKey: f,
      radiusKey: r,
    })
  } catch {
    return null
  }
}

/** The glass level of the instance (it has no organization layer), through the strict reader. */
export function glassOf(instance: unknown): GlassKey | null {
  const theme = (instance as { theme?: unknown } | null)?.theme
  if (typeof theme !== "object" || theme === null) return null
  return parseGlass((theme as { glassKey?: unknown }).glassKey)
}

/** Every layer goes through `parseSeeds` and `parseGlass`: hostile input never reaches the CSS. */
export function themeFromSources(
  instance: unknown,
  cookie: string | undefined
): string {
  const body = (instance ?? {}) as { theme?: unknown }
  return themeCss(
    resolveSeeds(parseSeeds(body.theme) ?? NONE, cookieSeeds(cookie)),
    glassOf(instance)
  )
}

/** CSS of the instance (and, once signed in, organization) theme, and the glass level for `<html data-glass>`; "" and null are the default. */
export async function loadTheme(): Promise<{
  css: string
  glass: GlassKey | null
}> {
  try {
    const store = await cookies()
    const res = await fetch(`${API_URL}/instance/public`, {
      next: { revalidate: 60 },
      signal: AbortSignal.timeout(2000),
    })
    const instance: unknown = await res.json()
    return {
      css: themeFromSources(instance, store.get(THEME_COOKIE)?.value),
      glass: glassOf(instance),
    }
  } catch {
    return { css: "", glass: null }
  }
}
