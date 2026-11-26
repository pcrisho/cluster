/** The principal a row with userId/orgNodeId/positionId points at, named from its included relation. */
export function principalOf(row: {
  userId: string | null
  orgNodeId: string | null
  positionId: string | null
  user?: { firstName: string; lastName: string; email: string } | null
  orgNode?: { name: string; parentId: string | null } | null
  position?: { name: string; orgNode?: { name: string } | null } | null
}) {
  if (row.userId && row.user) {
    return { type: PrincipalType.USER, id: row.userId, name: `${row.user.firstName} ${row.user.lastName}`, detail: row.user.email }
  }
  if (row.orgNodeId && row.orgNode) return { type: PrincipalType.ORG_NODE, id: row.orgNodeId, name: row.orgNode.name, main: row.orgNode.parentId === null }
  return { type: PrincipalType.POSITION, id: row.positionId!, name: row.position!.name, detail: row.position!.orgNode?.name }
}

/** The column that stores a principal of this type. */
export function principalColumn(type: PrincipalType, id: string) {
  return type === PrincipalType.USER ? { userId: id } : type === PrincipalType.ORG_NODE ? { orgNodeId: id } : { positionId: id }
}

/** Who an access entry or an assignment is for: one person, an area (with its sub-areas) or a position. */
export enum PrincipalType {
  USER = "USER",
  ORG_NODE = "ORG_NODE",
  POSITION = "POSITION",
}

/** Who a user is for access purposes: themselves, their area and every area above it, and their position. */
export interface PrincipalContext {
  userId: string
  orgNodeIds: string[]
  positionId: string | null
}

/** The node and all its ancestors (an entry for an area reaches its sub-areas). */
export function nodeAndAncestors(nodeId: string | null, parentOf: Map<string, string | null>): string[] {
  const ids: string[] = []
  let cursor = nodeId
  while (cursor && !ids.includes(cursor)) {
    ids.push(cursor)
    cursor = parentOf.get(cursor) ?? null
  }
  return ids
}

/** Prisma filter selecting the entries of any table with userId/orgNodeId/positionId that match the user. */
export function principalWhere(ctx: PrincipalContext) {
  return {
    OR: [
      { userId: ctx.userId },
      ...(ctx.orgNodeIds.length > 0 ? [{ orgNodeId: { in: ctx.orgNodeIds } }] : []),
      ...(ctx.positionId ? [{ positionId: ctx.positionId }] : []),
    ],
  }
}
