import { THEME_COOKIE } from "../theme/theme-cookie"
import { LOCALE_COOKIE, TIME_ZONE_COOKIE } from "./locales"

const ONE_YEAR = 60 * 60 * 24 * 365

function readCookie(name: string): string | undefined {
  return document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1)
}

/** The decoded value; a malformed one reads as `undefined` so it gets rewritten (or deleted). */
function readValue(name: string): string | null | undefined {
  const raw = readCookie(name)
  if (raw === undefined) return null
  try {
    return decodeURIComponent(raw)
  } catch {
    return undefined
  }
}

function writeCookie(name: string, value: string | null) {
  // Not httpOnly: it carries no secret, only what the server should render in.
  document.cookie =
    value === null
      ? `${name}=; Path=/; Max-Age=0; SameSite=Lax`
      : `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax`
}

/** Sets (or, with null, deletes) one render cookie; true when it changed. */
function sync(name: string, value: string | null): boolean {
  if (readValue(name) === value) return false
  writeCookie(name, value)
  return true
}

/**
 * Points the render cookies at the signed-in person's language, their organization's zone and
 * its theme (`themeCookieValue`; null removes it). Returns true when something changed, so the
 * caller re-renders the server parts once.
 */
export function syncPreferences(
  locale: string,
  timeZone: string,
  theme: string | null
): boolean {
  const changed = [
    sync(LOCALE_COOKIE, locale),
    sync(TIME_ZONE_COOKIE, timeZone),
    sync(THEME_COOKIE, theme),
  ]
  return changed.includes(true)
}

/** Signed out: the sign-in pages render in the instance theme. True when the cookie was there. */
export function clearThemeCookie(): boolean {
  return sync(THEME_COOKIE, null)
}
