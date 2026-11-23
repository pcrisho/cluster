import { placeBefore, subtreeHeight, subtreeOf } from "./org-tree"

describe("subtreeHeight", () => {
  const nodes = [
    { id: "a", parentId: null },
    { id: "b", parentId: "a" },
    { id: "c", parentId: "b" },
    { id: "d", parentId: "a" },
  ]
  it("counts the node itself", () => {
    expect(subtreeHeight(nodes, "c")).toBe(1)
    expect(subtreeHeight(nodes, "d")).toBe(1)
  })
  it("follows the deepest branch", () => {
    expect(subtreeHeight(nodes, "b")).toBe(2)
    expect(subtreeHeight(nodes, "a")).toBe(3)
  })
  it("stops on a loop in the data", () => {
    const loop = [
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
    ]
    expect(subtreeHeight(loop, "x")).toBe(2)
  })
})

describe("placeBefore", () => {
  it("puts the node before a sibling", () => {
    expect(placeBefore(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"])
    expect(placeBefore(["a", "b", "c"], "a", "c")).toEqual(["b", "a", "c"])
  })
  it("puts it last without a sibling", () => {
    expect(placeBefore(["a", "b"], "a", undefined)).toEqual(["b", "a"])
    expect(placeBefore(["a", "b"], "x", null)).toEqual(["a", "b", "x"])
  })
  it("refuses a sibling that is not there, or the node itself", () => {
    expect(placeBefore(["a", "b"], "c", "z")).toBeNull()
    expect(placeBefore(["a", "b"], "a", "a")).toBeNull()
  })
})

describe("subtreeOf", () => {
  const parentOf = new Map<string, string | null>([
    ["root", null],
    ["ops", "root"],
    ["ops-night", "ops"],
    ["sales", "root"],
  ])
  it("returns the given areas and every area below them", () => {
    expect([...subtreeOf(["ops"], parentOf)].sort()).toEqual(["ops", "ops-night"])
    expect([...subtreeOf(["root"], parentOf)].sort()).toEqual(["ops", "ops-night", "root", "sales"])
  })
  it("does not include the areas above a root", () => {
    expect([...subtreeOf(["ops-night"], parentOf)]).toEqual(["ops-night"])
  })
  it("is empty for no roots or unknown roots", () => {
    expect(subtreeOf([], parentOf).size).toBe(0)
    expect(subtreeOf(["missing"], parentOf).size).toBe(0)
  })
  it("stops on a loop in the data", () => {
    const loop = new Map<string, string | null>([
      ["x", "y"],
      ["y", "x"],
    ])
    expect([...subtreeOf(["z"], loop)]).toEqual([])
    expect([...subtreeOf(["x"], loop)].sort()).toEqual(["x", "y"])
  })
})
