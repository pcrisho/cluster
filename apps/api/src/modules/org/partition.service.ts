import { Injectable } from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import { loadInstanceSettings } from "../../common/instance-settings"
import type { AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { isCrosser, partitionScope, type PartitionScope } from "./partition"

/** Node partitions (docs/specs/org/node-partitions): who sees which people, areas and positions. */
@Injectable()
export class PartitionService {
  constructor(private readonly prisma: PrismaService) {}

  /** Effective switch: the superadmin allows node isolation and the organization turned it on. */
  async isolated(orgId: string): Promise<boolean> {
    const [settings, org] = await Promise.all([
      loadInstanceSettings(this.prisma),
      this.prisma.organization.findUnique({ where: { id: orgId }, select: { isolateRootNodes: true } }),
    ])
    return settings.nodeIsolationAllowed && org?.isolateRootNodes === true
  }

  /** The scope of a request. The tree is loaded only for a non-crosser under isolation. */
  async scopeFor(user: AuthenticatedUser): Promise<PartitionScope> {
    if (isCrosser(user) || !(await this.isolated(user.orgId))) return { all: true }
    const [nodes, profile] = await Promise.all([
      this.prisma.orgNode.findMany({ where: { organizationId: user.orgId }, select: { id: true, parentId: true } }),
      this.prisma.userProfile.findUnique({ where: { userId: user.id }, select: { orgNodeId: true } }),
    ])
    return partitionScope(
      user,
      true,
      new Map(nodes.map((n) => [n.id, n.parentId])),
      profile?.orgNodeId ?? null,
    )
  }

  /** Users to keep when filtering people by scope: their profile's node must be in scope (no node: nobody). */
  peopleFilter(scope: PartitionScope): Prisma.UserWhereInput {
    if (scope.all) return {}
    return { profile: { orgNodeId: { in: Array.from(scope.nodeIds) } } }
  }
}
