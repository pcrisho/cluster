import { EMPTY_SEEDS, themeCss, type Seeds } from "@cluster/theme"
import { themeFromSources } from "./server"
import { themeCookieValue } from "./theme-cookie"

const org: Seeds = {
  brandPrimary: "#0d9488",
  brandSecondary: "#7c3aed",
  fontKey: "dm-sans",
  radiusKey: "round",
}

// syncPreferences writes it URL-encoded and Next decodes it, so the layout reads the plain JSON.
const wire = (theme: Seeds | null) => themeCookieValue(theme) ?? undefined

describe("themeCookieValue", () => {
  it("round-trips through the layout's reader", () => {
    expect(themeFromSources({ theme: EMPTY_SEEDS }, wire(org))).toBe(
      themeCss(org)
    )
  })

  it("keeps only the fields that are set, with short keys", () => {
    expect(themeCookieValue({ ...EMPTY_SEEDS, radiusKey: "sharp" })).toBe(
      '{"r":"sharp"}'
    )
    expect(
      themeFromSources(
        { theme: { ...EMPTY_SEEDS, fontKey: "geist" } },
        wire({ ...EMPTY_SEEDS, radiusKey: "sharp" })
      )
    ).toBe(themeCss({ ...EMPTY_SEEDS, fontKey: "geist", radiusKey: "sharp" }))
  })

  it("is null when there is nothing to carry", () => {
    expect(themeCookieValue(null)).toBeNull()
    expect(themeCookieValue(EMPTY_SEEDS)).toBeNull()
  })
})
