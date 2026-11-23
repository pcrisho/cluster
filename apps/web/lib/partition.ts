/**
 * Main-node partitions on the web: mirrors `apps/api/src/modules/org/partition.ts` (the server decides;
 * these only decide what the screens offer). Spec: docs/specs/org/node-partitions.
 */

/** Sees every partition: admins, moderators, course managers and the superadmin. Mirrors `isCrosser` in the API. */
export function isCrosser(
  user:
    | { role: string; capabilities: readonly string[]; isSuperAdmin: boolean }
    | null
    | undefined
): boolean {
  if (!user) return false
  return (
    user.isSuperAdmin ||
    user.role === "ADMIN" ||
    user.role === "MANAGER" ||
    user.capabilities.includes("GROW_COURSE_MANAGE")
  )
}

/** The top node above `nodeId` (itself when it has no parent); null for no node, an unknown node or a loop. */
export function mainNodeOf(
  nodeId: string | null,
  parentOf: ReadonlyMap<string, string | null>
): string | null {
  if (!nodeId || !parentOf.has(nodeId)) return null
  const seen = new Set<string>()
  let cursor = nodeId
  for (;;) {
    if (seen.has(cursor)) return null
    seen.add(cursor)
    const parent = parentOf.get(cursor)
    if (!parent || !parentOf.has(parent)) return cursor
    cursor = parent
  }
}

/** The node and every node below it, loop-safe. */
export function subtreeIds(
  rootId: string,
  children: ReadonlyMap<string, readonly string[]>
): Set<string> {
  const out = new Set<string>([rootId])
  const queue = [rootId]
  while (queue.length > 0) {
    for (const child of children.get(queue.shift()!) ?? []) {
      if (!out.has(child)) {
        out.add(child)
        queue.push(child)
      }
    }
  }
  return out
}

/** Names from the top node down to `id`, e.g. "Engineering › Backend". */
export function areaPathLabel(
  id: string,
  byId: ReadonlyMap<string, { name: string; parentId: string | null }>
): string {
  const names: string[] = []
  const seen = new Set<string>()
  for (let cur: string | null = id; cur && !seen.has(cur); ) {
    seen.add(cur)
    const node = byId.get(cur)
    if (!node) break
    names.unshift(node.name)
    cur = node.parentId
  }
  return names.join(" › ")
}
