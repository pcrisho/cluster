import { mergeMessages } from "./merge"

describe("mergeMessages", () => {
  it("takes the translation where it exists and English elsewhere, at any depth", () => {
    const en = { a: "A", group: { b: "B", c: "C" } }
    expect(mergeMessages(en, { group: { b: "Be" } })).toEqual({
      a: "A",
      group: { b: "Be", c: "C" },
    })
  })

  it("does not change the English catalog", () => {
    const en = { group: { b: "B" } }
    mergeMessages(en, { group: { b: "Be" } })
    expect(en.group.b).toBe("B")
  })
})
