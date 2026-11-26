import { WebSocketGateway, WebSocketServer } from "@nestjs/websockets"
import { Server } from "socket.io"
import { Injectable } from "@nestjs/common"

@WebSocketGateway()
@Injectable()
export class ConnectGateway {
  @WebSocketServer() server!: Server

  emitPostCreated(
    orgId: string,
    data: {
      postId: string
      title: string
      authorId: string
      authorName: string
    },
  ) {
    this.server.to(`org:${orgId}`).emit("connect:post:created", data)
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
  ) {
    this.server.to(`org:${orgId}`).emit("connect:post:liked", data)
  }

  emitCommentCreated(
    orgId: string,
    data: { postId: string; commentId: string; authorId: string },
  ) {
    this.server.to(`org:${orgId}`).emit("connect:comment:created", data)
  }
}
