import { NotFoundException } from "@nestjs/common"
import { Prisma, UserRole } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { isCrosser, nodeInScope, type PartitionScope } from "../org/partition"
import { principalOf, principalWhere, type PrincipalContext } from "../org/principal"

/** Posts of other organizations do not exist as far as the caller is concerned. */
export async function findPostInOrg(prisma: PrismaService, postId: string, orgId: string) {
  const post = await prisma.post.findFirst({ where: { id: postId, organizationId: orgId } })
  if (!post) throw new NotFoundException("Post not found")
  return post
}

export const AUTHOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  role: true,
} as const

export const AUDIENCE_INCLUDE = {
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      profile: { select: { orgNodeId: true } },
    },
  },
  orgNode: { select: { id: true, name: true, parentId: true } },
  position: {
    select: {
      id: true,
      name: true,
      orgNodeId: true,
      orgNode: { select: { name: true } },
    },
  },
} as const

export type AudienceEntryRow = {
  userId: string | null
  orgNodeId: string | null
  positionId: string | null
  user?: {
    id: string
    firstName: string
    lastName: string
    email: string
    profile: { orgNodeId: string | null } | null
  } | null
  orgNode?: { id: string; name: string; parentId: string | null } | null
  position?: {
    id: string
    name: string
    orgNodeId: string | null
    orgNode?: { name: string } | null
  } | null
}

/** Admins, tenant moderators (MANAGER) and superadmins moderate every post across partitions. */
export function isFeedModerator(user: { role: UserRole | string; isSuperAdmin?: boolean }): boolean {
  return user.isSuperAdmin === true || user.role === UserRole.ADMIN || user.role === UserRole.MANAGER
}

/** While main nodes are isolated, only crossers may publish to everyone (`restricted: false`). */
export function canOpenPostToAll(
  user: { role: UserRole | string; capabilities: string[]; isSuperAdmin?: boolean },
  isolated: boolean,
): boolean {
  return !isolated || isCrosser(user)
}

/** Prisma filter for the feed: moderators see everything in the org; others see open, own, or targeted posts. */
export function visiblePostWhere(
  user: { id: string; orgId: string; role: UserRole | string; isSuperAdmin?: boolean },
  ctx: PrincipalContext | null,
): Prisma.PostWhereInput {
  if (isFeedModerator(user)) return { organizationId: user.orgId }
  return {
    organizationId: user.orgId,
    OR: [
      { restricted: false },
      { authorId: user.id },
      ...(ctx ? [{ audience: { some: principalWhere(ctx) } }] : []),
    ],
  }
}

/** Pure mirror of `visiblePostWhere` for a single post already loaded with its audience rows. */
export function canReadPost(
  user: { id: string; role: UserRole | string; isSuperAdmin?: boolean },
  post: {
    restricted: boolean
    authorId: string
    audience: { userId: string | null; orgNodeId: string | null; positionId: string | null }[]
  },
  ctx: PrincipalContext | null,
): boolean {
  if (isFeedModerator(user) || !post.restricted || post.authorId === user.id) return true
  if (!ctx) return false
  return post.audience.some(
    (entry) =>
      entry.userId === ctx.userId ||
      (entry.orgNodeId !== null && ctx.orgNodeIds.includes(entry.orgNodeId)) ||
      (entry.positionId !== null && ctx.positionId === entry.positionId),
  )
}

/** Filters a post's audience to the viewer's partition scope and counts omitted entries in other partitions. */
export function audienceForViewer(entries: readonly AudienceEntryRow[], scope: PartitionScope) {
  const audience = []
  let hiddenAudienceCount = 0

  for (const entry of entries) {
    const inScope =
      scope.all ||
      (entry.userId
        ? nodeInScope(scope, entry.user?.profile?.orgNodeId ?? null)
        : entry.orgNodeId
          ? nodeInScope(scope, entry.orgNodeId)
          : nodeInScope(scope, entry.position?.orgNodeId ?? null))

    if (!inScope) {
      hiddenAudienceCount += 1
      continue
    }
    if ((entry.userId && entry.user) || (entry.orgNodeId && entry.orgNode) || (entry.positionId && entry.position)) {
      audience.push(principalOf(entry))
    }
  }

  return { audience, hiddenAudienceCount }
}
