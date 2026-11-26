import { diffLines } from "./line-diff"

describe("diffLines", () => {
  it("marks added and removed lines around the common ones", () => {
    expect(diffLines("a\nb\nc", "a\nx\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "removed", text: "b" },
      { kind: "added", text: "x" },
      { kind: "same", text: "c" },
      { kind: "added", text: "d" },
    ])
  })

  it("is all same for equal texts and handles empty sides", () => {
    expect(diffLines("a", "a")).toEqual([{ kind: "same", text: "a" }])
    expect(diffLines("", "a")).toEqual([{ kind: "added", text: "a" }])
    expect(diffLines("a", "")).toEqual([{ kind: "removed", text: "a" }])
    expect(diffLines("", "")).toEqual([])
  })
})
