import type { OrgNode } from "./org-api"

export interface MainNodeComplianceSummary {
  total: number
  completed: number
  overdue: number
  rate: number | null
}

export interface RootNodeRow {
  /** The main node itself (manager, icon, code, kind). */
  node: OrgNode
  /** People in the node and in every area below it. */
  people: number
  /** Areas below the node (the node excluded). */
  areas: number
  /** Mandatory-course compliance rolled up across this main node, when GROW is enabled. */
  compliance?: MainNodeComplianceSummary
}

export type KindFilter = "all" | "internal" | "external"
export type RootSort = "name" | "people" | "compliance"

/** One row per main node (no parent). A node whose parent is not in the list is nobody's root nor part of any count. */
export function rootNodeRows(
  nodes: OrgNode[],
  complianceByNode?: ReadonlyMap<string, MainNodeComplianceSummary> | null
): RootNodeRow[] {
  const children = new Map<string, OrgNode[]>()
  for (const n of nodes)
    if (n.parentId)
      children.set(n.parentId, [...(children.get(n.parentId) ?? []), n])
  return nodes
    .filter((n) => n.parentId === null)
    .map((node) => {
      // Iterative walk with a visited set: a loop in the data cannot hang it.
      const seen = new Set([node.id])
      let people = 0
      const stack = [node]
      for (let n = stack.pop(); n; n = stack.pop()) {
        people += n._count.profiles
        for (const c of children.get(n.id) ?? [])
          if (!seen.has(c.id)) {
            seen.add(c.id)
            stack.push(c)
          }
      }
      return {
        node,
        people,
        areas: seen.size - 1,
        compliance: complianceByNode?.get(node.id),
      }
    })
}

/** `query` matches the name or the code, case-insensitive. */
export function filterRootRows(
  rows: RootNodeRow[],
  { query, kind }: { query: string; kind: KindFilter }
): RootNodeRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter(
    ({ node }) =>
      (kind === "all" || node.external === (kind === "external")) &&
      (!q ||
        node.name.toLowerCase().includes(q) ||
        (node.code ?? "").toLowerCase().includes(q))
  )
}

/** By name ascending, by people descending, or by compliance ascending (lowest first, unrated last). Returns a new array. */
export function sortRootRows(
  rows: RootNodeRow[],
  sort: RootSort
): RootNodeRow[] {
  const byName = (a: RootNodeRow, b: RootNodeRow) =>
    a.node.name.localeCompare(b.node.name)
  if (sort === "name") return [...rows].sort(byName)
  if (sort === "people")
    return [...rows].sort((a, b) => b.people - a.people || byName(a, b))
  return [...rows].sort((a, b) => {
    const ar = a.compliance?.rate ?? null
    const br = b.compliance?.rate ?? null
    if (ar === null && br === null) return byName(a, b)
    if (ar === null) return 1
    if (br === null) return -1
    return (
      ar - br ||
      (b.compliance?.overdue ?? 0) - (a.compliance?.overdue ?? 0) ||
      byName(a, b)
    )
  })
}
