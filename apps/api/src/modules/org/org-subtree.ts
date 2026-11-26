import type { PrismaService } from "../../prisma/prisma.service"
import { subtreeOf } from "./org-tree"

/**
 * The people placed in a node and in every node below it, or null when the node is not in this organization.
 * Runs in the caller's organization context.
 */
export async function subtreeMemberIds(prisma: PrismaService, orgId: string, nodeId: string): Promise<string[] | null> {
  const nodes = await prisma.orgNode.findMany({
    where: { organizationId: orgId },
    select: { id: true, parentId: true },
  })
  if (!nodes.some((n) => n.id === nodeId)) return null
  const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]))
  const profiles = await prisma.userProfile.findMany({
    where: { orgNodeId: { in: [...subtreeOf([nodeId], parentOf)] } },
    select: { userId: true },
  })
  return profiles.map((p) => p.userId)
}
