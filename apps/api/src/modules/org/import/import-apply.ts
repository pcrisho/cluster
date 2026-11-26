import type { Capability, Prisma } from "@prisma/client"
import { mainNodeOf } from "../partition"
import type { ImportSnapshot, ImportWrites } from "./import-types"

export interface ApplyOptions {
  orgId: string
  actorId: string
  /** `inviteQueuedAt` of the new members, `undefined` for nobody. */
  inviteQueuedAt?: Date
}

const asDate = (day: string) => new Date(day)

/** New nodes top-down, each after its existing siblings. Internal (`external: false`); the kind is changed in the main-node table. */
async function createNodes(tx: Prisma.TransactionClient, orgId: string, writes: ImportWrites) {
  const next = new Map<string | null, number>()
  for (const node of writes.newNodes) {
    if (!next.has(node.parentId)) {
      const { _max } = await tx.orgNode.aggregate({
        where: { organizationId: orgId, parentId: node.parentId },
        _max: { sortOrder: true },
      })
      next.set(node.parentId, (_max.sortOrder ?? -1) + 1)
    }
    const sortOrder = next.get(node.parentId) as number
    next.set(node.parentId, sortOrder + 1)
    await tx.orgNode.create({
      data: {
        id: node.id,
        name: node.name,
        code: node.code,
        parentId: node.parentId,
        sortOrder,
        external: false,
        organizationId: orgId,
      },
    })
  }
}

/** Existing members: one statement per changed user and profile, only the changed columns. */
async function updateMembers(tx: Prisma.TransactionClient, orgId: string, writes: ImportWrites) {
  const now = new Date()
  for (const u of writes.updates) {
    if (Object.keys(u.user).length > 0) await tx.user.update({ where: { id: u.userId }, data: u.user })
    const { assignmentChangedAt, joinedAt, ...rest } = u.profile
    if (Object.keys(u.profile).length > 0) {
      const data = {
        ...rest,
        ...(joinedAt && { joinedAt: asDate(joinedAt) }),
        ...(assignmentChangedAt && { assignmentChangedAt: now }),
      }
      await tx.userProfile.upsert({
        where: { userId: u.userId },
        create: { userId: u.userId, organizationId: orgId, ...data },
        update: data,
      })
    }
    if (u.capabilities.remove.length > 0)
      await tx.userCapability.deleteMany({
        where: { userId: u.userId, capability: { in: u.capabilities.remove as Capability[] } },
      })
  }
}

/**
 * The writes of a plan, in the design's order (docs/specs/org/bulk-import/design.md): nodes, released managers,
 * accounts and profiles, updates, capabilities, managers. The caller wraps this in one transaction and audits it.
 */
export async function applyWrites(
  tx: Prisma.TransactionClient,
  writes: ImportWrites,
  accounts: (rows: ImportWrites["newMembers"]) => Promise<void>,
  opts: ApplyOptions,
) {
  const { orgId, actorId } = opts
  await createNodes(tx, orgId, writes)
  if (writes.releaseManagers.length > 0)
    await tx.orgNode.updateMany({ where: { id: { in: writes.releaseManagers } }, data: { managerId: null } })

  if (writes.newMembers.length > 0) {
    await accounts(writes.newMembers)
    const now = new Date()
    await tx.userProfile.createMany({
      data: writes.newMembers.map((m) => ({
        userId: m.id,
        organizationId: orgId,
        orgNodeId: m.orgNodeId,
        positionId: m.positionId,
        ...(m.joinedAt && { joinedAt: asDate(m.joinedAt) }),
        // Anchor of relative LMS due dates: a new hire's count starts when they join the node, not when the course was assigned.
        ...((m.orgNodeId || m.positionId) && { assignmentChangedAt: now }),
      })),
    })
  }

  await updateMembers(tx, orgId, writes)

  const grants = [
    ...writes.newMembers.flatMap((m) => m.capabilities.map((capability) => ({ userId: m.id, capability }))),
    ...writes.updates.flatMap((u) => u.capabilities.add.map((capability) => ({ userId: u.userId, capability }))),
  ]
  if (grants.length > 0)
    await tx.userCapability.createMany({
      data: grants.map((g) => ({
        userId: g.userId,
        capability: g.capability as Capability,
        grantedById: actorId,
        organizationId: orgId,
      })),
      skipDuplicates: true,
    })

  // Managers last: the nodes that lose one were released above (a person manages one node at most).
  for (const { nodeId, userId } of writes.setManagers)
    await tx.orgNode.update({ where: { id: nodeId }, data: { managerId: userId } })
}

/** Main nodes the import touched: where new nodes hang and where created or changed members sit (for "Export access"). */
export function touchedMainNodes(writes: ImportWrites, snapshot: ImportSnapshot): string[] {
  const parentOf = new Map<string, string | null>([...snapshot.tree, ...writes.newNodes].map((n) => [n.id, n.parentId]))
  const currentNode = new Map([...snapshot.members.values()].map((m) => [m.id, m.orgNodeId]))
  const nodes = [
    ...writes.newNodes.map((n) => n.id),
    ...writes.newMembers.map((m) => m.orgNodeId),
    ...writes.updates.map((u) => ("orgNodeId" in u.profile ? u.profile.orgNodeId : currentNode.get(u.userId)) ?? null),
  ]
  return [...new Set(nodes.map((id) => mainNodeOf(id, parentOf)).filter((id): id is string => id !== null))]
}
