import type { OrgNode } from "./org-api"
import {
  filterRootRows,
  rootNodeRows,
  sortRootRows,
  type MainNodeComplianceSummary,
  type RootNodeRow,
} from "./root-node-rows"

function node(
  id: string,
  parentId: string | null,
  people: number,
  extra: Partial<OrgNode> = {}
): OrgNode {
  return {
    id,
    name: id,
    icon: null,
    sortOrder: 0,
    parentId,
    managerId: null,
    manager: null,
    isActive: true,
    archivedAt: null,
    code: null,
    external: false,
    _count: { profiles: people },
    ...extra,
  }
}

const nodes = [
  node("Acme", null, 2, { code: "ACME-01" }),
  node("Sales", "Acme", 3),
  node("Sales-EU", "Sales", 4),
  node("Globex", null, 1, { external: true, code: "RUC.20" }),
  node("Zeta", null, 9, { external: true }),
]

describe("rootNodeRows", () => {
  it("lists roots only and counts people (node included) and areas (node excluded) over the subtree", () => {
    const rows = rootNodeRows(nodes)
    expect(rows.map((r) => r.node.id)).toEqual(["Acme", "Globex", "Zeta"])
    expect(rows[0]).toMatchObject({ people: 9, areas: 2 })
    expect(rows[1]).toMatchObject({ people: 1, areas: 0 })
  })

  it("ignores a node whose parent is missing from the list", () => {
    const rows = rootNodeRows([...nodes, node("Orphan", "Gone", 50)])
    expect(rows.map((r) => r.node.id)).toEqual(["Acme", "Globex", "Zeta"])
    expect(rows.reduce((s, r) => s + r.people, 0)).toBe(9 + 1 + 9)
  })

  it("survives a loop in the data", () => {
    const rows = rootNodeRows([
      node("R", null, 1),
      node("A", "B", 1),
      node("B", "A", 1),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ people: 1, areas: 0 })
  })
})

describe("filterRootRows", () => {
  const rows = rootNodeRows(nodes)
  const ids = (r: RootNodeRow[]) => r.map((x) => x.node.id)

  it("filters by kind", () => {
    expect(ids(filterRootRows(rows, { query: "", kind: "internal" }))).toEqual([
      "Acme",
    ])
    expect(ids(filterRootRows(rows, { query: "", kind: "external" }))).toEqual([
      "Globex",
      "Zeta",
    ])
    expect(ids(filterRootRows(rows, { query: "", kind: "all" }))).toHaveLength(
      3
    )
  })

  it("searches name or code, case-insensitive", () => {
    expect(ids(filterRootRows(rows, { query: " acme ", kind: "all" }))).toEqual(
      ["Acme"]
    )
    expect(ids(filterRootRows(rows, { query: "ruc.20", kind: "all" }))).toEqual(
      ["Globex"]
    )
    expect(ids(filterRootRows(rows, { query: "nope", kind: "all" }))).toEqual(
      []
    )
  })
})

describe("sortRootRows", () => {
  const rows = rootNodeRows(nodes)
  const ids = (r: RootNodeRow[]) => r.map((x) => x.node.id)

  it("sorts by name, and by people descending then name", () => {
    expect(ids(sortRootRows([...rows].reverse(), "name"))).toEqual([
      "Acme",
      "Globex",
      "Zeta",
    ])
    expect(ids(sortRootRows(rows, "people"))).toEqual([
      "Acme",
      "Zeta",
      "Globex",
    ])
  })

  it("does not mutate its input", () => {
    const copy = [...rows].reverse()
    const before = ids(copy)
    sortRootRows(copy, "name")
    expect(ids(copy)).toEqual(before)
  })

  it("attaches compliance and sorts lowest compliance first, overdue tie-break, unrated last", () => {
    const compliance = new Map<string, MainNodeComplianceSummary>([
      ["Acme", { total: 4, completed: 2, overdue: 0, rate: 50 }],
      ["Globex", { total: 4, completed: 2, overdue: 2, rate: 50 }],
      ["Zeta", { total: 0, completed: 0, overdue: 0, rate: null }],
    ])
    const withCompliance = rootNodeRows(
      [...nodes, node("Beta", null, 3), node("Omega", null, 2)],
      compliance
    )
    compliance.set("Beta", { total: 2, completed: 2, overdue: 0, rate: 100 })
    const rows2 = rootNodeRows(
      [...nodes, node("Beta", null, 3), node("Omega", null, 2)],
      compliance
    )
    expect(withCompliance.find((r) => r.node.id === "Acme")?.compliance).toEqual(
      { total: 4, completed: 2, overdue: 0, rate: 50 }
    )
    expect(ids(sortRootRows(rows2, "compliance"))).toEqual([
      "Globex",
      "Acme",
      "Beta",
      "Omega",
      "Zeta",
    ])
  })
})
