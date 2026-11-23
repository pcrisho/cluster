import en from "@/messages/en.json"
import es from "@/messages/es.json"
import { SUPPORTED_LOCALES } from "./locales"
import { icuArguments } from "./icu-arguments"

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === "string") out.set(path, value)
    else for (const [k, v] of flatten(value, path)) out.set(k, v)
  }
  return out
}

const catalogs: Record<string, Tree> = { en, es }

describe("icuArguments", () => {
  it("finds plain, formatted and nested arguments, not plural branch text", () => {
    expect([...icuArguments("Hi {name}")]).toEqual(["name"])
    expect(
      [
        ...icuArguments(
          "{count, plural, one {# lesson} other {# lessons by {author}}}"
        ),
      ].sort()
    ).toEqual(["author", "count"])
    expect(
      [...icuArguments("{n, number, percent} on {date, date, short}")].sort()
    ).toEqual(["date", "n"])
    expect([...icuArguments("No arguments")]).toEqual([])
  })
})

describe("message catalogs", () => {
  const source = flatten(en)

  it("exist for every supported language", () => {
    expect(Object.keys(catalogs).sort()).toEqual([...SUPPORTED_LOCALES].sort())
  })

  for (const locale of SUPPORTED_LOCALES.filter((l) => l !== "en")) {
    const translated = flatten(catalogs[locale]!)

    it(`${locale} has exactly the keys of en`, () => {
      const missing = [...source.keys()].filter((k) => !translated.has(k))
      const extra = [...translated.keys()].filter((k) => !source.has(k))
      expect({ missing, extra }).toEqual({ missing: [], extra: [] })
    })

    it(`${locale} has no empty text and keeps every placeholder`, () => {
      const problems: string[] = []
      for (const [key, text] of translated) {
        if (!text.trim()) problems.push(`${key}: empty`)
        const want = [...icuArguments(source.get(key) ?? "")].sort().join(",")
        const got = [...icuArguments(text)].sort().join(",")
        if (want !== got)
          problems.push(`${key}: {${want}} in en, {${got}} in ${locale}`)
      }
      expect(problems).toEqual([])
    })
  }
})
