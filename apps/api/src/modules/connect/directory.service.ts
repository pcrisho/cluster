import { Injectable, NotFoundException } from "@nestjs/common"
import type { Prisma } from "@prisma/client"
import type { AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { PartitionService } from "../org/partition.service"
import { buildDirectoryWhere } from "./directory-filters"
import { completedYears } from "./celebrations.service"
import { DirectoryQueryDto, DirectorySort } from "./dto/directory-query.dto"

const MAX_PAGE_SIZE = 50

@Injectable()
export class DirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partition: PartitionService,
  ) {}

  async list(user: AuthenticatedUser, query: DirectoryQueryDto) {
    const page = query.page ?? 1
    const take = Math.min(query.limit ?? 20, MAX_PAGE_SIZE)
    const scope = await this.partition.scopeFor(user)
    const where: Prisma.UserWhereInput = {
      AND: [buildDirectoryWhere(user.orgId, query), this.partition.peopleFilter(scope)],
    }
    const desc = query.sort === DirectorySort.NAME_DESC
    const direction = desc ? "desc" : "asc"

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: [{ firstName: direction }, { lastName: direction }],
        take,
        skip: (page - 1) * take,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          avatarUrl: true,
          profile: {
            select: {
              bio: true,
              orgNode: { select: { id: true, name: true } },
              position: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.user.count({ where }),
    ])
    return { success: true, data: users, meta: { total, page, limit: take } }
  }

  async profile(userId: string, viewer: AuthenticatedUser) {
    const orgId = viewer.orgId
    const scope = userId !== viewer.id ? await this.partition.scopeFor(viewer) : { all: true as const }
    const user = await this.prisma.user.findFirst({
      where: {
        id: userId,
        organizationId: orgId,
        isActive: true,
        ...(userId !== viewer.id ? this.partition.peopleFilter(scope) : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        avatarUrl: true,
        createdAt: true,
        profile: {
          select: {
            bio: true,
            phone: true,
            joinedAt: true,
            showBirthday: true,
            orgNode: {
              select: {
                id: true,
                name: true,
                manager: {
                  select: { id: true, firstName: true, lastName: true, avatarUrl: true },
                },
              },
            },
            position: { select: { id: true, name: true } },
          },
        },
      },
    })
    if (!user) throw new NotFoundException("User not found")

    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { timezone: true, celebrationsEnabled: true, showAnniversaries: true },
    })
    const showTenure = org.celebrationsEnabled && org.showAnniversaries && !!user.profile
    const years = showTenure ? completedYears(user.profile!.joinedAt, new Date(), org.timezone) : 0

    const orgNode = user.profile?.orgNode
    return {
      success: true,
      data: {
        ...user,
        profile: {
          ...user.profile,
          orgNode: orgNode ? { ...orgNode, path: await this.areaPath(orgId, orgNode.id) } : null,
          yearsInOrganization: years >= 1 ? years : null,
        },
      },
    }
  }

  /** Names from the root area down to `areaId`. Org charts are small, so one query and a walk in memory. */
  private async areaPath(orgId: string, areaId: string): Promise<string[]> {
    const areas = await this.prisma.orgNode.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, parentId: true },
    })
    const byId = new Map(areas.map((a) => [a.id, a]))
    const path: string[] = []
    for (let area = byId.get(areaId); area && path.length <= areas.length; area = area.parentId ? byId.get(area.parentId) : undefined) {
      path.unshift(area.name)
    }
    return path
  }
}
