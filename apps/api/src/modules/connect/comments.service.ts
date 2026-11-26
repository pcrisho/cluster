import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { NotificationService } from "../notification/notification.service"
import { ConnectGateway } from "./connect.gateway"
import { bestEffort } from "../../common/best-effort"
import { AUTHOR_SELECT, findPostInOrg } from "./post-access"
import { CreateCommentDto } from "./dto/create-comment.dto"

@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: ConnectGateway,
    private readonly notifications: NotificationService,
  ) {}

  async list(postId: string, orgId: string) {
    await findPostInOrg(this.prisma, postId, orgId)
    const comments = await this.prisma.postComment.findMany({
      where: { postId },
      include: { author: { select: AUTHOR_SELECT } },
      orderBy: { createdAt: "asc" },
    })
    return { success: true, data: comments }
  }

  async create(postId: string, dto: CreateCommentDto, userId: string, orgId: string) {
    const post = await findPostInOrg(this.prisma, postId, orgId)
    const comment = await this.prisma.postComment.create({
      data: { body: dto.body, postId, authorId: userId },
      include: { author: { select: AUTHOR_SELECT } },
    })

    await bestEffort("comment:created event", () =>
      this.gateway.emitCommentCreated(orgId, { postId, commentId: comment.id, authorId: userId }),
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

  async remove(commentId: string, userId: string, orgId: string, role: string) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, post: { organizationId: orgId } },
    })
    if (!comment) throw new NotFoundException("Comment not found")
    if (comment.authorId !== userId && role !== "ADMIN") {
      throw new ForbiddenException("You are not allowed to delete this comment")
    }
    await this.prisma.postComment.delete({ where: { id: commentId } })
    return { success: true }
  }
}
