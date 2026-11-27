import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { UserRole } from "@prisma/client"
import type { AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { subtreeOf } from "../org/org-tree"
import { isCrosser, mainNodeOf } from "../org/partition"
import { PartitionService } from "../org/partition.service"
import { PrincipalType } from "../org/principal"
import { PrincipalService } from "../org/principal.service"
import { canReadPost, isFeedModerator } from "./post-access"

export interface AudienceEntryInput {
  type: PrincipalType
  id: string
}

export interface ResolvedAudienceWrite {
  restricted: boolean
  /** `null` means leave existing `PostAudience` rows untouched on an update. */
  entries: AudienceEntryInput[] | null
}

@Injectable()
export class PostAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partition: PartitionService,
    private readonly principals: PrincipalService,
  ) {}

  /** Loads a post inside the caller's organization and refuses (404) if outside their audience. */
  async requireReadable(user: AuthenticatedUser, postId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId: user.orgId },
      include: {
        audience: { select: { userId: true, orgNodeId: true, positionId: true } },
      },
    })
    if (!post) throw new NotFoundException("Post not found")
    if (!isFeedModerator(user)) {
      const ctx = await this.principals.contextFor(user.id, user.orgId)
      if (!canReadPost(user, post, ctx)) throw new NotFoundException("Post not found")
    }
    return post
  }

  /**
   * Validates `restricted` and `audience` for post creation or update under current isolation rules.
   * Returns `null` on update when neither field was provided (leaving audience untouched).
   */
  async resolveAudienceForWrite(
    user: AuthenticatedUser,
    input: { restricted?: boolean; audience?: AudienceEntryInput[] },
    current?: { restricted: boolean },
  ): Promise<ResolvedAudienceWrite | null> {
    if (current && input.restricted === undefined && input.audience === undefined) {
      return null
    }

    const isolated = await this.partition.isolated(user.orgId)
    const deduped = input.audience ? this.dedupe(input.audience) : undefined

    if (!current) {
      if (!isolated) {
        const restricted = input.restricted ?? (deduped !== undefined && deduped.length > 0)
        if (!restricted) return { restricted: false, entries: [] }
        return {
          restricted: true,
          entries: await this.validateEntries(user.orgId, deduped, { all: true }),
        }
      }

      if (isCrosser(user)) {
        const restricted = input.restricted ?? true
        if (!restricted) return { restricted: false, entries: [] }
        return {
          restricted: true,
          entries: await this.validateEntries(user.orgId, deduped, { all: true }),
        }
      }

      // Non-crosser under isolation: cannot publish to everyone, defaults to own main node.
      if (input.restricted === false) {
        throw new ForbiddenException({
          code: "ISOLATION_OPEN_POST",
          message: "Only people who see every main node can publish to everyone",
        })
      }
      const scope = await this.partition.scopeFor(user)
      if (input.audience === undefined) {
        const mainId = await this.mainNodeOfUser(user.id, user.orgId)
        if (!mainId) {
          throw new BadRequestException({
            code: "NODE_REQUIRED",
            message: "While main nodes are isolated, you need an area to publish",
          })
        }
        return { restricted: true, entries: [{ type: PrincipalType.ORG_NODE, id: mainId }] }
      }
      return {
        restricted: true,
        entries: await this.validateEntries(user.orgId, deduped, scope),
      }
    }

    // Update existing post
    if (isolated && !isCrosser(user) && input.restricted === false && current.restricted) {
      throw new ForbiddenException({
        code: "ISOLATION_OPEN_POST",
        message: "Only people who see every main node can publish to everyone",
      })
    }

    const nextRestricted = input.restricted ?? current.restricted
    if (!nextRestricted) return { restricted: false, entries: [] }

    if (input.audience !== undefined) {
      const scope = await this.partition.scopeFor(user)
      return {
        restricted: true,
        entries: await this.validateEntries(user.orgId, deduped, scope),
      }
    }

    if (!current.restricted) {
      throw new BadRequestException({
        code: "POST_AUDIENCE_REQUIRED",
        message: "Choose at least one person, area or position for a restricted post",
      })
    }

    return { restricted: true, entries: null }
  }

  /**
   * Active user ids who can read a restricted post (author, feed moderators, and matching audience),
   * or `null` when the post is open to the whole organization.
   */
  async recipientUserIds(postId: string, orgId: string): Promise<string[] | null> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, organizationId: orgId },
      select: {
        restricted: true,
        authorId: true,
        audience: { select: { userId: true, orgNodeId: true, positionId: true } },
      },
    })
    if (!post || !post.restricted) return null

    const userIds = post.audience.flatMap((e) => (e.userId ? [e.userId] : []))
    const rawNodeIds = post.audience.flatMap((e) => (e.orgNodeId ? [e.orgNodeId] : []))
    const positionIds = post.audience.flatMap((e) => (e.positionId ? [e.positionId] : []))

    let expandedNodeIds: string[] = []
    if (rawNodeIds.length > 0) {
      const nodes = await this.prisma.orgNode.findMany({
        where: { organizationId: orgId },
        select: { id: true, parentId: true },
      })
      expandedNodeIds = [...subtreeOf(rawNodeIds, new Map(nodes.map((n) => [n.id, n.parentId])))]
    }

    const recipients = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        isActive: true,
        OR: [
          { id: post.authorId },
          { role: { in: [UserRole.ADMIN, UserRole.MANAGER] } },
          { isSuperAdmin: true },
          ...(userIds.length > 0 ? [{ id: { in: userIds } }] : []),
          ...(expandedNodeIds.length > 0 ? [{ profile: { orgNodeId: { in: expandedNodeIds } } }] : []),
          ...(positionIds.length > 0 ? [{ profile: { positionId: { in: positionIds } } }] : []),
        ],
      },
      select: { id: true },
    })
    return recipients.map((r) => r.id)
  }

  private dedupe(entries: readonly AudienceEntryInput[]): AudienceEntryInput[] {
    const seen = new Set<string>()
    const out: AudienceEntryInput[] = []
    for (const entry of entries) {
      const key = `${entry.type}:${entry.id}`
      if (!seen.has(key)) {
        seen.add(key)
        out.push(entry)
      }
    }
    return out
  }

  private async validateEntries(
    orgId: string,
    entries: AudienceEntryInput[] | undefined,
    scope: Awaited<ReturnType<PartitionService["scopeFor"]>>,
  ): Promise<AudienceEntryInput[]> {
    if (!entries || entries.length === 0) {
      throw new BadRequestException({
        code: "POST_AUDIENCE_REQUIRED",
        message: "Choose at least one person, area or position for a restricted post",
      })
    }
    await Promise.all(entries.map((e) => this.principals.assertActive(orgId, e.type, e.id, scope)))
    return entries
  }

  private async mainNodeOfUser(userId: string, orgId: string): Promise<string | null> {
    const [profile, nodes] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { userId }, select: { orgNodeId: true } }),
      this.prisma.orgNode.findMany({ where: { organizationId: orgId }, select: { id: true, parentId: true } }),
    ])
    return mainNodeOf(profile?.orgNodeId ?? null, new Map(nodes.map((n) => [n.id, n.parentId])))
  }
}
