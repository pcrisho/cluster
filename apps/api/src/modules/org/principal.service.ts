import { Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { nodeAndAncestors, PrincipalType, type PrincipalContext } from "./principal"
import { PartitionService } from "./partition.service"
import type { PartitionScope } from "./partition"

@Injectable()
export class PrincipalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partition: PartitionService,
  ) {}

  async contextFor(userId: string, orgId: string): Promise<PrincipalContext> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { orgNodeId: true, positionId: true },
    })
    let orgNodeIds: string[] = []
    if (profile?.orgNodeId) {
      const nodes = await this.prisma.orgNode.findMany({
        where: { organizationId: orgId },
        select: { id: true, parentId: true },
      })
      orgNodeIds = nodeAndAncestors(profile.orgNodeId, new Map(nodes.map((n) => [n.id, n.parentId])))
    }
    return { userId, orgNodeIds, positionId: profile?.positionId ?? null }
  }

  /** The person, area or position exists in the organization, is still active and in the scope (404 otherwise). */
  async assertActive(orgId: string, type: PrincipalType, id: string, scope: PartitionScope = { all: true }) {
    const nodeIds = scope.all ? undefined : Array.from(scope.nodeIds)
    const found =
      type === PrincipalType.USER
        ? await this.prisma.user.findFirst({
            where: { id, organizationId: orgId, isActive: true, ...this.partition.peopleFilter(scope) },
            select: { id: true },
          })
        : type === PrincipalType.ORG_NODE
          ? await this.prisma.orgNode.findFirst({
              where: {
                id,
                organizationId: orgId,
                isActive: true,
                archivedAt: null,
                ...(nodeIds && { AND: [{ id: { in: nodeIds } }] }),
              },
              select: { id: true },
            })
          : await this.prisma.position.findFirst({
              where: {
                id,
                organizationId: orgId,
                isActive: true,
                // A global position reaches its holders in every main node, so granting it crosses them.
                ...(nodeIds && { orgNodeId: { in: nodeIds } }),
              },
              select: { id: true },
            })
    if (!found) throw new NotFoundException("Person, area or position not found")
  }

  /** Active people, live areas and active positions whose name matches, up to 8 of each, limited to `scope`. */
  async search(orgId: string, text: string, scope: PartitionScope = { all: true }) {
    const like = { contains: text.trim(), mode: "insensitive" as const }
    const nodeIds = scope.all ? undefined : Array.from(scope.nodeIds)
    const [users, nodes, positions] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          organizationId: orgId,
          isActive: true,
          OR: [{ firstName: like }, { lastName: like }, { email: like }],
          ...this.partition.peopleFilter(scope),
        },
        select: { id: true, firstName: true, lastName: true, email: true },
        orderBy: { firstName: "asc" },
        take: 8,
      }),
      this.prisma.orgNode.findMany({
        where: {
          organizationId: orgId,
          isActive: true,
          archivedAt: null,
          name: like,
          ...(nodeIds && { id: { in: nodeIds } }),
        },
        select: { id: true, name: true, parentId: true },
        orderBy: { name: "asc" },
        take: 8,
      }),
      this.prisma.position.findMany({
        where: {
          organizationId: orgId,
          isActive: true,
          name: like,
          ...(nodeIds && { orgNodeId: { in: nodeIds } }),
        },
        select: { id: true, name: true, orgNode: { select: { name: true } } },
        orderBy: { name: "asc" },
        take: 8,
      }),
    ])
    return [
      ...users.map((u) => ({ type: PrincipalType.USER, id: u.id, name: `${u.firstName} ${u.lastName}`, detail: u.email })),
      ...nodes.map((n) => ({ type: PrincipalType.ORG_NODE, id: n.id, name: n.name, main: n.parentId === null })),
      ...positions.map((p) => ({ type: PrincipalType.POSITION, id: p.id, name: p.name, detail: p.orgNode?.name })),
    ]
  }
}
