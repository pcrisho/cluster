import {
  applyPlacement,
  indexAreas,
  placementOf,
  resolveDrop as resolve,
  type AreaNode,
} from "./area-drop"
import { rowAt, zoneOf } from "./tree-dnd"

const node = (
  id: string,
  parentId: string | null,
  sortOrder: number
): AreaNode => ({
  id,
  name: id.toUpperCase(),
  parentId,
  sortOrder,
  isActive: true,
})

// r1: a, b, c (b has x)   r2
const nodes = [
  node("r1", null, 10),
  node("r2", null, 20),
  node("a", "r1", 10),
  node("b", "r1", 20),
  node("c", "r1", 30),
  node("x", "b", 10),
]
// The specs read better with the nodes passed in; a real drag builds the index once.
const resolveDrop = (
  list: AreaNode[],
  active: string,
  target: string,
  zone: Parameters<typeof resolve>[3],
  isOpen: (id: string) => boolean
) => resolve(indexAreas(list), active, target, zone, isOpen)
const closed = () => false
const open = (ids: string[]) => (id: string) => ids.includes(id)

describe("zoneOf", () => {
  const rect = { top: 100, height: 40 }
  it("splits a row in three", () => {
    expect(zoneOf(105, rect)).toBe("before")
    expect(zoneOf(120, rect)).toBe("inside")
    expect(zoneOf(135, rect)).toBe("after")
  })
})

describe("rowAt", () => {
  const rows = [
    { id: "a", top: 0, height: 38 },
    { id: "b", top: 38, height: 38 },
    { id: "c", top: 76, height: 38 },
  ]
  it("finds the row holding y, edges included on the top side", () => {
    expect(rowAt(rows, 0)?.id).toBe("a")
    expect(rowAt(rows, 37.9)?.id).toBe("a")
    expect(rowAt(rows, 38)?.id).toBe("b")
    expect(rowAt(rows, 113)?.id).toBe("c")
  })
  it("returns null outside the list", () => {
    expect(rowAt(rows, -1)).toBeNull()
    expect(rowAt(rows, 114)).toBeNull()
    expect(rowAt([], 5)).toBeNull()
  })
})

describe("placementOf", () => {
  it("names the parent and the next sibling", () => {
    expect(placementOf(indexAreas(nodes), "a")).toEqual({
      parentId: "r1",
      beforeId: "b",
    })
    expect(placementOf(indexAreas(nodes), "c")).toEqual({
      parentId: "r1",
      beforeId: null,
    })
  })
})

describe("resolveDrop", () => {
  it("goes before or after a sibling", () => {
    expect(resolveDrop(nodes, "c", "a", "before", closed)).toEqual({
      kind: "ok",
      zone: "before",
      placement: { parentId: "r1", beforeId: "a" },
    })
    expect(resolveDrop(nodes, "a", "c", "after", closed)).toMatchObject({
      kind: "ok",
      placement: { parentId: "r1", beforeId: null },
    })
  })

  it("becomes a sub-area when dropped on the middle", () => {
    expect(resolveDrop(nodes, "c", "a", "inside", closed)).toEqual({
      kind: "ok",
      zone: "inside",
      placement: { parentId: "a", beforeId: null },
    })
  })

  it("goes first inside an open area when dropped on its lower third", () => {
    expect(resolveDrop(nodes, "c", "b", "after", open(["b"]))).toEqual({
      kind: "ok",
      zone: "inside",
      placement: { parentId: "b", beforeId: "x" },
    })
    // closed: a plain "after b"
    expect(resolveDrop(nodes, "a", "b", "after", closed)).toMatchObject({
      placement: { parentId: "r1", beforeId: "c" },
    })
  })

  it("does nothing when the place is the current one", () => {
    expect(resolveDrop(nodes, "b", "a", "after", closed)).toEqual({
      kind: "same",
    })
    expect(resolveDrop(nodes, "a", "b", "before", closed)).toEqual({
      kind: "same",
    })
    expect(resolveDrop(nodes, "a", "a", "inside", closed)).toEqual({
      kind: "same",
    })
  })

  it("refuses to go inside its own sub-areas", () => {
    expect(resolveDrop(nodes, "r1", "x", "inside", closed)).toEqual({
      kind: "refused",
      reason: "cycle",
    })
  })

  it("refuses a name the new parent already has", () => {
    const twins = [...nodes, { ...node("a2", "r2", 10), name: "A" }]
    expect(resolveDrop(twins, "a", "r2", "inside", closed)).toEqual({
      kind: "refused",
      reason: "duplicate",
    })
  })

  it("counts the moved subtree against the depth limit", () => {
    // chain d1 > d2 > d3 > d4 > d5 and a two-level subtree s > t
    const chain = ["d1", "d2", "d3", "d4", "d5"].map((id, i, all) =>
      node(id, i ? all[i - 1] : null, 10)
    )
    const tall = [...chain, node("s", null, 20), node("t", "s", 10)]
    expect(resolveDrop(tall, "s", "d5", "inside", closed)).toEqual({
      kind: "refused",
      reason: "depth",
    })
    expect(resolveDrop(tall, "s", "d4", "inside", closed)).toMatchObject({
      kind: "ok",
    })
  })

  it("ignores archived areas among the siblings", () => {
    const withArchived = [
      ...nodes,
      { ...node("old", "r1", 15), isActive: false },
    ]
    expect(placementOf(indexAreas(withArchived), "a")).toEqual({
      parentId: "r1",
      beforeId: "b",
    })
  })
})

describe("applyPlacement", () => {
  it("reparents and renumbers like the server", () => {
    const next = applyPlacement(nodes, "c", { parentId: "r1", beforeId: "a" })
    const order = next
      .filter((n) => n.parentId === "r1")
      .sort((p, q) => p.sortOrder - q.sortOrder)
      .map((n) => n.id)
    expect(order).toEqual(["c", "a", "b"])
    expect(
      applyPlacement(nodes, "a", { parentId: "r2", beforeId: null }).find(
        (n) => n.id === "a"
      )
    ).toMatchObject({
      parentId: "r2",
      sortOrder: 10,
    })
  })
})
