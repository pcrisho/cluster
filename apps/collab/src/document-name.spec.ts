import { InvalidDocumentNameError, parseDocumentName } from "./document-name"

const ID = "0b6f7a3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b"

describe("parseDocumentName", () => {
  it("splits a page name into kind and id", () => {
    expect(parseDocumentName(`know.page:${ID}`)).toEqual({
      kind: "know.page",
      id: ID,
    })
  })

  it("accepts nested kinds", () => {
    expect(parseDocumentName(`grow.lesson.step:${ID}`)).toEqual({
      kind: "grow.lesson.step",
      id: ID,
    })
  })

  it.each([
    ["uppercase kind", `KNOW.page:${ID}`],
    ["missing colon", `know.page${ID}`],
    ["short id", `know.page:${ID.slice(1)}`],
    ["extra colon", `know.page:${ID}:x`],
    ["path traversal", `../know.page:${ID}`],
    ["path traversal in id", `know.page:../../${ID.slice(6)}`],
    ["empty string", ""],
    ["empty kind", `:${ID}`],
    ["uppercase id", `know.page:${ID.toUpperCase()}`],
  ])("rejects %s", (_label, name) => {
    expect(() => parseDocumentName(name)).toThrow(InvalidDocumentNameError)
  })

  it.each([[undefined], [null], [42], [{ name: `know.page:${ID}` }]])(
    "rejects non-string input %p",
    (value) => {
      expect(() => parseDocumentName(value as unknown as string)).toThrow(
        InvalidDocumentNameError
      )
    }
  )
})
