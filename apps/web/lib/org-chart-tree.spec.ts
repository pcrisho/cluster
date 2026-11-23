import {
  defaultCollapsed,
  subtreeIds,
  subtreeMemberCounts,
  visibleAreas,
  type ChartArea,
} from "./org-chart-tree"

const area = (
  id: string,
  parentId: string | null,
  profiles: number
): ChartArea => ({
  id,
  parentId,
  _count: { profiles },
})

//  root(1) ─ a(2) ─ a1(3) ─ a11(4)
//         └─ b(0)
const areas = [
  area("root", null, 1),
  area("a", "root", 2),
  area("a1", "a", 3),
  area("a11", "a1", 4),
  area("b", "root", 0),
]

describe("org chart tree", () => {
  it("lists an area with everything under it", () => {
    expect(subtreeIds(areas, "a").sort()).toEqual(["a", "a1", "a11"])
    expect(subtreeIds(areas, "b")).toEqual(["b"])
  })

  it("counts members of the whole subtree", () => {
    const counts = subtreeMemberCounts(areas)
    expect(counts.get("root")).toBe(10)
    expect(counts.get("a")).toBe(9)
    expect(counts.get("b")).toBe(0)
  })

  it("collapses from the open depth down, only areas that have children", () => {
    expect([...defaultCollapsed(areas, 1)]).toEqual(["a"])
    expect([...defaultCollapsed(areas, 0)]).toEqual(["root"])
    expect([...defaultCollapsed(areas, 2)]).toEqual(["a1"])
  })

  it("hides what sits under a collapsed area, at any depth", () => {
    const ids = (c: string[]) =>
      visibleAreas(areas, new Set(c)).map((a) => a.id)
    expect(ids([])).toEqual(["root", "a", "a1", "a11", "b"])
    expect(ids(["a"])).toEqual(["root", "a", "b"])
    expect(ids(["root"])).toEqual(["root"])
  })

  it("survives a cycle and an orphan", () => {
    const odd = [area("x", "y", 1), area("y", "x", 1), area("z", "ghost", 1)]
    expect(subtreeIds(odd, "x").sort()).toEqual(["x", "y"])
    // Terminates, and the orphan stays visible.
    expect(visibleAreas(odd, new Set(["x"])).map((a) => a.id)).toContain("z")
    expect(defaultCollapsed(odd).size).toBe(0)
  })
})
