/** Levels of the subtree rooted at `id`, the node itself counting as 1 (a leaf is 1). */
export function subtreeHeight(
  nodes: readonly { id: string; parentId: string | null }[],
  id: string,
): number {
  const children = new Map<string, string[]>()
  for (const n of nodes) {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) ?? []), n.id])
  }
  const height = (nodeId: string, seen: Set<string>): number => {
    if (seen.has(nodeId)) return 0 // a loop in the data must not hang the request
    seen.add(nodeId)
    return 1 + Math.max(0, ...(children.get(nodeId) ?? []).map((c) => height(c, seen)))
  }
  return height(id, new Set())
}

/** `ids` with `id` taken out and put before `beforeId`, or last when `beforeId` is absent. `null` if `beforeId` is not in `ids`. */
export function placeBefore(
  ids: readonly string[],
  id: string,
  beforeId: string | null | undefined,
): string[] | null {
  const rest = ids.filter((x) => x !== id)
  if (!beforeId) return [...rest, id]
  const at = rest.indexOf(beforeId)
  if (at === -1) return null
  return [...rest.slice(0, at), id, ...rest.slice(at)]
}

/** The given areas and every area below them. */
export function subtreeOf(rootIds: string[], parentOf: Map<string, string | null>): Set<string> {
  const roots = new Set(rootIds)
  const nodeIds = new Set<string>()
  for (const id of parentOf.keys()) {
    // Walk up from each area: it is in the subtree when a root is on its path.
    let cursor: string | null | undefined = id
    const seen = new Set<string>()
    while (cursor && !seen.has(cursor)) {
      if (roots.has(cursor)) {
        nodeIds.add(id)
        break
      }
      seen.add(cursor)
      cursor = parentOf.get(cursor)
    }
  }
  return nodeIds
}
