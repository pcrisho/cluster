import {
  pickLocale,
  isSupportedLocale,
  getStoredLocale,
  setStoredLocale,
  LOCALE_STORAGE_KEY,
  DEFAULT_LOCALE,
} from "./locale-pick"

describe("locale-pick", () => {
  describe("isSupportedLocale", () => {
    it("recognizes en and es as supported", () => {
      expect(isSupportedLocale("en")).toBe(true)
      expect(isSupportedLocale("es")).toBe(true)
    })

    it("rejects unsupported locales", () => {
      expect(isSupportedLocale("fr")).toBe(false)
      expect(isSupportedLocale("")).toBe(false)
      expect(isSupportedLocale(null)).toBe(false)
      expect(isSupportedLocale(undefined)).toBe(false)
    })
  })

  describe("pickLocale", () => {
    it("uses valid stored locale first", () => {
      expect(pickLocale("es", ["en-US"])).toBe("es")
      expect(pickLocale("en", ["es-ES"])).toBe("en")
    })

    it("ignores invalid stored locale and checks languages", () => {
      expect(pickLocale("fr", ["es-419", "en"])).toBe("es")
      expect(pickLocale(null, ["es-AR", "en"])).toBe("es")
      expect(pickLocale(undefined, ["en-GB", "es"])).toBe("en")
    })

    it("picks first matching supported language in languages list", () => {
      expect(pickLocale(null, ["fr-FR", "es-ES", "en-US"])).toBe("es")
      expect(pickLocale(null, ["pt-BR", "en-US", "es"])).toBe("en")
    })

    it("falls back to default en when no language matches or list is empty", () => {
      expect(pickLocale(null, ["fr-FR", "de-DE"])).toBe(DEFAULT_LOCALE)
      expect(pickLocale(null, [])).toBe(DEFAULT_LOCALE)
      expect(pickLocale(null, null)).toBe(DEFAULT_LOCALE)
      expect(pickLocale(null, undefined)).toBe(DEFAULT_LOCALE)
    })
  })

  describe("storage access", () => {
    const mockStorage: Record<string, string> = {}
    beforeAll(() => {
      Object.defineProperty(global, "window", {
        value: {
          localStorage: {
            getItem: (key: string) => mockStorage[key] ?? null,
            setItem: (key: string, val: string) => {
              mockStorage[key] = val
            },
          },
        },
        writable: true,
      })
    })

    it("reads and writes cluster_site_locale in localStorage", () => {
      setStoredLocale("es")
      expect(getStoredLocale()).toBe("es")
      expect(mockStorage[LOCALE_STORAGE_KEY]).toBe("es")
      setStoredLocale("en")
      expect(getStoredLocale()).toBe("en")
    })
  })
})
