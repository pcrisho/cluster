import type { OrgNode } from "./org-api"

export interface RootNodeRow {
  /** The main node itself (manager, icon, code, kind). */
  node: OrgNode
  /** People in the node and in every area below it. */
  people: number
  /** Areas below the node (the node excluded). */
  areas: number
}

export type KindFilter = "all" | "internal" | "external"
export type RootSort = "name" | "people"

/** One row per main node (no parent). A node whose parent is not in the list is nobody's root nor part of any count. */
export function rootNodeRows(nodes: OrgNode[]): RootNodeRow[] {
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
      return { node, people, areas: seen.size - 1 }
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

/** By name ascending, or by people descending and then name. Returns a new array. */
export function sortRootRows(
  rows: RootNodeRow[],
  sort: RootSort
): RootNodeRow[] {
  const byName = (a: RootNodeRow, b: RootNodeRow) =>
    a.node.name.localeCompare(b.node.name)
  return [...rows].sort(
    sort === "name" ? byName : (a, b) => b.people - a.people || byName(a, b)
  )
}
