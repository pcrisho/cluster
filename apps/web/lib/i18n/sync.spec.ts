import { THEME_COOKIE } from "../theme/theme-cookie"
import { LOCALE_COOKIE, TIME_ZONE_COOKIE } from "./locales"
import { clearThemeCookie, syncPreferences } from "./sync"

// A tiny cookie jar behind `document.cookie`: reads "a=1; b=2", writes one "name=value; attrs" at a time.
const jar = new Map<string, string>()
beforeAll(() => {
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      get cookie() {
        return [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
      },
      set cookie(line: string) {
        const [pair, ...attrs] = line.split("; ")
        const i = pair.indexOf("=")
        const name = pair.slice(0, i)
        if (attrs.includes("Max-Age=0")) jar.delete(name)
        else jar.set(name, pair.slice(i + 1))
      },
    },
  })
})
beforeEach(() => jar.clear())

const theme = '{"p":"#0a6cff"}'

describe("syncPreferences", () => {
  it("writes the cookies URL-encoded and reports a change once", () => {
    expect(syncPreferences("es", "America/Lima", theme)).toBe(true)
    expect(jar.get(THEME_COOKIE)).toBe(encodeURIComponent(theme))
    expect(jar.get(LOCALE_COOKIE)).toBe("es")
    expect(jar.get(TIME_ZONE_COOKIE)).toBe(encodeURIComponent("America/Lima"))
    expect(syncPreferences("es", "America/Lima", theme)).toBe(false)
  })

  it("rewrites a different theme and deletes it for null", () => {
    syncPreferences("es", "UTC", theme)
    expect(syncPreferences("es", "UTC", '{"r":"round"}')).toBe(true)
    expect(jar.get(THEME_COOKIE)).toBe(encodeURIComponent('{"r":"round"}'))
    expect(syncPreferences("es", "UTC", null)).toBe(true)
    expect(jar.has(THEME_COOKIE)).toBe(false)
    expect(clearThemeCookie()).toBe(false)
  })

  it("treats a malformed cookie as different and rewrites it instead of throwing", () => {
    jar.set(THEME_COOKIE, "%E0")
    expect(() => syncPreferences("es", "UTC", theme)).not.toThrow()
    expect(jar.get(THEME_COOKIE)).toBe(encodeURIComponent(theme))
    jar.set(THEME_COOKIE, "%E0")
    expect(clearThemeCookie()).toBe(true)
    expect(jar.has(THEME_COOKIE)).toBe(false)
  })
})
