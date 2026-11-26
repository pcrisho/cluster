import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { PrismaService } from "../../prisma/prisma.service"
import { StorageService } from "../storage/storage.service"
import { isOwnUploadKey } from "../storage/file-url"
import { NotificationService } from "../notification/notification.service"
import { ConnectGateway } from "./connect.gateway"
import { bestEffort } from "../../common/best-effort"
import { AUTHOR_SELECT, findPostInOrg } from "./post-access"
import { CreatePostDto, PostType } from "./dto/create-post.dto"
import { UpdatePostDto } from "./dto/update-post.dto"
import { parsePostBody } from "./post-body"

const MAX_PINNED = 3
const MAX_PAGE_SIZE = 50
/** The people the card names under a post ("Ana y 4 personas más"). */
const RECENT_LIKERS = 3
const LIKER_SELECT = { id: true, firstName: true, lastName: true, avatarUrl: true } as const
const NEWEST_LIKE_FIRST = [{ createdAt: "desc" }, { id: "desc" }] satisfies Prisma.PostLikeOrderByWithRelationInput[]

@Injectable()
export class PostsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ConnectGateway,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
  ) {}

  async createPost(dto: CreatePostDto, userId: string, orgId: string, role: string) {
    const isAnnouncement = dto.type === PostType.ANNOUNCEMENT
    const isPinned = dto.isPinned ?? isAnnouncement

    this.assertOwnImages(orgId, dto.images)
    if (isAnnouncement || isPinned) {
      this.assertCanAnnounce(role)
      if (isPinned) await this.assertPinSlotFree(orgId)
    }

    const { body, excerpt } = parsePostBody(dto.body, orgId)
    const post = await this.prisma.post.create({
      data: {
        title: dto.title ?? null,
        body,
        excerpt: dto.excerpt ?? excerpt,
        images: dto.images ?? [],
        type: dto.type ?? PostType.POST,
        isPinned,
        pinnedExpiresAt: dto.pinnedExpiresAt ? new Date(dto.pinnedExpiresAt) : undefined,
        authorId: userId,
        organizationId: orgId,
      },
      include: { author: { select: AUTHOR_SELECT } },
    })

    const authorName = `${post.author.firstName} ${post.author.lastName}`
    await bestEffort("post:created event", () =>
      this.gateway.emitPostCreated(orgId, {
        postId: post.id,
        title: post.title ?? "",
        authorId: post.authorId,
        authorName,
      }),
    )
    if (isAnnouncement) {
      await bestEffort("announcement notification", async () => {
        const members = await this.prisma.user.findMany({
          where: { organizationId: orgId, isActive: true },
          select: { id: true },
        })
        await this.notifications.notifyMany(
          members.map((m) => m.id),
          {
            type: "connect:announcement",
            title: `${authorName} posted: ${post.title ?? "Announcement"}`,
            body: post.excerpt ?? undefined,
            link: "/connect/feed",
            payload: {
              postId: post.id,
              type: post.type,
              params: { name: authorName, title: post.title ?? "", titled: post.title ? "yes" : "no" },
            },
          },
        )
      })
    }

    return { success: true, data: post }
  }

  async updatePost(postId: string, dto: UpdatePostDto, userId: string, orgId: string, role: string) {
    const post = await findPostInOrg(this.prisma, postId, orgId)
    if (post.authorId !== userId && role !== "ADMIN") {
      throw new ForbiddenException("You are not allowed to edit this post")
    }

    this.assertOwnImages(orgId, dto.images)
    const willBePinned = dto.isPinned ?? post.isPinned
    if (dto.type === PostType.ANNOUNCEMENT || willBePinned) this.assertCanAnnounce(role)
    if (dto.isPinned && !post.isPinned) await this.assertPinSlotFree(orgId)

    const parsed = dto.body !== undefined ? parsePostBody(dto.body, orgId) : undefined
    const updated = await this.prisma.post.update({
      where: { id: postId },
      data: {
        title: dto.title,
        body: parsed?.body,
        excerpt: dto.excerpt ?? parsed?.excerpt,
        images: dto.images,
        type: dto.type,
        isPinned: dto.isPinned,
        pinnedExpiresAt: dto.pinnedExpiresAt ? new Date(dto.pinnedExpiresAt) : undefined,
      },
      include: { author: { select: AUTHOR_SELECT } },
    })
    return { success: true, data: updated }
  }

  async deletePost(postId: string, userId: string, orgId: string, role: string) {
    const post = await findPostInOrg(this.prisma, postId, orgId)
    if (post.authorId !== userId && role !== "ADMIN") {
      throw new ForbiddenException("You are not allowed to delete this post")
    }

    await Promise.allSettled(
      post.images.filter((key) => isOwnUploadKey(orgId, key)).map((key) => this.storage.deleteFile(key)),
    )
    await this.prisma.post.delete({ where: { id: postId } })
    return { success: true }
  }

  /** Likes the post, or removes the like if there was one. Safe against double taps. */
  async toggleLike(postId: string, userId: string, orgId: string) {
    const post = await findPostInOrg(this.prisma, postId, orgId)

    const removed = await this.prisma.postLike.deleteMany({ where: { postId, userId } })
    const liked = removed.count === 0
    if (liked) {
      await this.prisma.postLike.create({ data: { postId, userId } }).catch((e) => {
        // A concurrent tap already created it: the end state is the same.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002")) throw e
      })
    }
    const likesCount = await this.prisma.postLike.count({ where: { postId } })
    // The count and the people it names travel together, or a card shows "and 1 more" with nobody before it.
    const recentLikers = (
      await this.prisma.postLike.findMany({
        where: { postId },
        orderBy: NEWEST_LIKE_FIRST,
        take: RECENT_LIKERS,
        select: { user: { select: LIKER_SELECT } },
      })
    ).map((l) => l.user)

    await bestEffort("post:liked event", () =>
      this.gateway.emitPostLiked(orgId, { postId, userId, liked, likesCount, recentLikers }),
    )
    if (liked && post.authorId !== userId) {
      await bestEffort("like notification", async () => {
        const liker = await this.prisma.user.findUniqueOrThrow({
          where: { id: userId },
          select: { firstName: true, lastName: true },
        })
        await this.notifications.notify(post.authorId, {
          type: "connect:post:liked",
          title: `${liker.firstName} ${liker.lastName} liked your post`,
          body: post.title ?? undefined,
          link: "/connect/feed",
          payload: { postId, likesCount, params: { name: `${liker.firstName} ${liker.lastName}` } },
        })
      })
    }

    return { success: true, data: { liked, likesCount, recentLikers } }
  }

  /**
   * Everyone who liked the post, newest first. The cursor is the id of the last like returned;
   * shortcut: if that like is removed before the next page is asked for, the next page comes back
   * empty. Fine for a list a person scrolls once; revisit if it needs to be exact.
   */
  async listLikes(postId: string, orgId: string, cursor: string | undefined, limit = 20) {
    await findPostInOrg(this.prisma, postId, orgId)
    const size = Math.min(limit, MAX_PAGE_SIZE)
    const rows = await this.prisma.postLike.findMany({
      where: { postId },
      orderBy: NEWEST_LIKE_FIRST,
      take: size + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: { id: true, user: { select: LIKER_SELECT } },
    })
    const page = rows.slice(0, size)
    return {
      success: true,
      data: page.map((l) => l.user),
      meta: { cursor: rows.length > size ? page[page.length - 1].id : undefined, limit: size },
    }
  }

  /**
   * "top": pinned announcements first (first page only), then newest. "recent": newest only.
   * Pages are keyed by createdAt; two posts created in the same millisecond may be split across pages.
   */
  async getFeed(orgId: string, userId: string, cursor: string | undefined, limit = 20, sort: "top" | "recent" = "top") {
    const size = Math.min(limit, MAX_PAGE_SIZE)
    const pinnedWhere: Prisma.PostWhereInput = {
      organizationId: orgId,
      isPinned: true,
      OR: [{ pinnedExpiresAt: null }, { pinnedExpiresAt: { gt: new Date() } }],
    }
    const include = {
      author: { select: AUTHOR_SELECT },
      likes: {
        orderBy: NEWEST_LIKE_FIRST,
        take: RECENT_LIKERS,
        select: { user: { select: LIKER_SELECT } },
      },
      _count: { select: { comments: true, likes: true } },
    } satisfies Prisma.PostInclude

    const pinned =
      sort === "top" && !cursor
        ? await this.prisma.post.findMany({ where: pinnedWhere, orderBy: { createdAt: "desc" }, include })
        : []
    const rows = await this.prisma.post.findMany({
      where: {
        organizationId: orgId,
        ...(sort === "top" && { NOT: pinnedWhere }),
        ...(cursor && { createdAt: { lt: new Date(cursor) } }),
      },
      orderBy: { createdAt: "desc" },
      take: size + 1,
      include,
    })

    const hasMore = rows.length > size
    const page = rows.slice(0, size)
    const posts = [...pinned, ...page]
    const liked = new Set(
      (
        await this.prisma.postLike.findMany({
          where: { userId, postId: { in: posts.map((p) => p.id) } },
          select: { postId: true },
        })
      ).map((l) => l.postId),
    )

    return {
      success: true,
      data: posts.map(({ likes, ...post }) => ({
        ...post,
        likedByMe: liked.has(post.id),
        recentLikers: likes.map((l) => l.user),
      })),
      meta: {
        cursor: hasMore ? page[page.length - 1].createdAt.toISOString() : undefined,
        limit: size,
      },
    }
  }

  private assertCanAnnounce(role: string) {
    if (role !== "ADMIN" && role !== "MANAGER") {
      throw new ForbiddenException("Only admins and moderators can publish or pin announcements")
    }
  }

  private assertOwnImages(orgId: string, images?: string[]) {
    if (images?.some((key) => !isOwnUploadKey(orgId, key))) {
      throw new BadRequestException("Images must be uploaded through /files/images")
    }
  }

  private async assertPinSlotFree(orgId: string) {
    const pinned = await this.prisma.post.count({
      where: {
        organizationId: orgId,
        isPinned: true,
        OR: [{ pinnedExpiresAt: null }, { pinnedExpiresAt: { gt: new Date() } }],
      },
    })
    if (pinned >= MAX_PINNED) {
      throw new BadRequestException({
        code: "PINNED_LIMIT",
        message: `Maximum of ${MAX_PINNED} pinned announcements allowed`,
        params: { max: MAX_PINNED },
      })
    }
  }
}
