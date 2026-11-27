import { Capability, UserRole } from "@prisma/client"
import { subtreeOf } from "./org-tree"

/** Which people and positions a user may see: the whole organization, or the people of some nodes. */
export type PartitionScope = { all: true } | { all: false; nodeIds: Set<string> }

/** Users who see the whole organization even when nodes are isolated: admins, tenant managers, course managers, superadmins. */
export function isCrosser(user: {
  role: UserRole | string
  capabilities: (Capability | string)[]
  isSuperAdmin?: boolean
}): boolean {
  return (
    user.isSuperAdmin === true ||
    user.role === UserRole.ADMIN ||
    user.role === UserRole.MANAGER ||
    user.capabilities.includes(Capability.GROW_COURSE_MANAGE)
  )
}

/** The top node (no parent) above `nodeId`; null for no node, an unknown node or a loop in the data. */
export function mainNodeOf(nodeId: string | null, parentOf: Map<string, string | null>): string | null {
  if (!nodeId || !parentOf.has(nodeId)) return null
  const seen = new Set<string>()
  let cursor: string = nodeId
  for (;;) {
    if (seen.has(cursor)) return null
    seen.add(cursor)
    const parent = parentOf.get(cursor)
    if (!parent) return cursor
    if (!parentOf.has(parent)) return cursor
    cursor = parent
  }
}

/** The scope a user sees: everything when not isolated or a crosser, else the subtree of their main node. */
export function partitionScope(
  user: {
    role: UserRole | string
    capabilities: (Capability | string)[]
    isSuperAdmin?: boolean
  },
  isolated: boolean,
  parentOf: Map<string, string | null>,
  nodeId: string | null,
): PartitionScope {
  if (!isolated || isCrosser(user)) return { all: true }
  const main = mainNodeOf(nodeId, parentOf)
  if (!main) return { all: false, nodeIds: new Set() }
  return { all: false, nodeIds: subtreeOf([main], parentOf) }
}

/** A node is in scope when the scope is the whole organization, or the node is in its set (no node only in the whole). */
export function nodeInScope(scope: PartitionScope, nodeId: string | null): boolean {
  if (scope.all) return true
  return nodeId !== null && scope.nodeIds.has(nodeId)
}

/** Whether isolation conflicts with a module: LIFE is not partitioned yet, so it cannot run isolated. */
export function isolationBlocksModule(isolated: boolean, modules: readonly string[]): boolean {
  return isolated && modules.includes("LIFE")
}
