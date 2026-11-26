import type { Seeds } from "@cluster/theme"

export const THEME_COOKIE = "cluster_theme"

/**
 * The organization layer as the `cluster_theme` cookie carries it (read by `themeFromSources`):
 * JSON with short keys and only the fields that are set; null when there is nothing to carry.
 * Not URL-encoded here: `syncPreferences` encodes on write.
 */
export function themeCookieValue(theme: Seeds | null): string | null {
  if (!theme) return null
  const short = {
    p: theme.brandPrimary ?? undefined,
    s: theme.brandSecondary ?? undefined,
    f: theme.fontKey ?? undefined,
    r: theme.radiusKey ?? undefined,
  }
  const json = JSON.stringify(short)
  return json === "{}" ? null : json
}
