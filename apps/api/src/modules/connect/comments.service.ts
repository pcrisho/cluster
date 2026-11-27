import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import type { AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { NotificationService } from "../notification/notification.service"
import { ConnectGateway } from "./connect.gateway"
import { bestEffort } from "../../common/best-effort"
import { AUTHOR_SELECT } from "./post-access"
import { PostAccessService } from "./post-access.service"
import { CreateCommentDto } from "./dto/create-comment.dto"

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ConnectGateway,
    private readonly notifications: NotificationService,
    private readonly postAccess: PostAccessService,
  ) {}

  async list(postId: string, user: AuthenticatedUser) {
    await this.postAccess.requireReadable(user, postId)
    const comments = await this.prisma.postComment.findMany({
      where: { postId },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: "asc" },
    })
    return { success: true, data: comments }
  }

  async create(postId: string, dto: CreateCommentDto, user: AuthenticatedUser) {
    const { id: userId, orgId } = user
    const post = await this.postAccess.requireReadable(user, postId)
    const comment = await this.prisma.postComment.create({
      data: { body: dto.body, postId, authorId: userId },
      include: { author: { select: AUTHOR_SELECT } },
    })

    const recipients = post.restricted ? await this.postAccess.recipientUserIds(postId, orgId) : null
    await bestEffort("comment:created event", () =>
      this.gateway.emitCommentCreated(orgId, { postId, commentId: comment.id, authorId: userId }, recipients),
    )
    if (post.authorId !== userId) {
      await bestEffort("comment notification", () =>
        this.notifications.notify(post.authorId, {
          type: "connect:comment:created",
          title: `${comment.author.firstName} ${comment.author.lastName} commented on your post`,
          body: dto.body.slice(0, 150),
          link: "/connect/feed",
          payload: {
            postId,
            commentId: comment.id,
            params: { name: `${comment.author.firstName} ${comment.author.lastName}` },
          },
        }),
      )
    }
    return { success: true, data: comment }
  }

  async remove(commentId: string, user: AuthenticatedUser) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, post: { organizationId: user.orgId } },
    })
    if (!comment) throw new NotFoundException("Comment not found")
    await this.postAccess.requireReadable(user, comment.postId)
    if (comment.authorId !== user.id && user.role !== "ADMIN") {
      throw new ForbiddenException("You are not allowed to delete this comment")
    }
    await this.prisma.postComment.delete({ where: { id: commentId } })
    return { success: true }
  }
}
