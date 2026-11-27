import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets"
import { Server } from "socket.io"
import { Injectable } from "@nestjs/common"

@WebSocketGateway()
@Injectable()
export class ConnectGateway {
  @WebSocketServer() server!: Server

  private target(orgId: string, userIds?: string[] | null) {
    if (userIds === undefined || userIds === null) return this.server.to(`org:${orgId}`)
    if (userIds.length === 0) return null
    return this.server.to([...new Set(userIds)].map((id) => `user:${id}`))
  }

  emitPostCreated(
    orgId: string,
    data: {
      postId: string
      title: string
      authorId: string
      authorName: string
    },
    userIds?: string[] | null,
  ) {
    this.target(orgId, userIds)?.emit("connect:post:created", data)
  }

  emitPostLiked(
    orgId: string,
    data: {
      postId: string
      userId: string
      liked: boolean
      likesCount: number
      /** The newest likers, so every open feed can name them without asking again. */
      recentLikers: { id: string; firstName: string; lastName: string; avatarUrl: string | null }[]
    },
    userIds?: string[] | null,
  ) {
    this.target(orgId, userIds)?.emit("connect:post:liked", data)
  }

  emitCommentCreated(
    orgId: string,
    data: { postId: string; commentId: string; authorId: string },
    userIds?: string[] | null,
  ) {
    this.target(orgId, userIds)?.emit("connect:comment:created", data)
  }
}
