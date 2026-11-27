import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { ModuleKey } from "@prisma/client"
import { CurrentUser, RequireModule, type AuthenticatedUser } from "../../common/decorators"
import { CommentsService } from "./comments.service"
import { CreateCommentDto } from "./dto/create-comment.dto"

@RequireModule(ModuleKey.CONNECT)
@Controller("connect")
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Throttle({ default: { limit: 300, ttl: 60000 } })
  @Get("posts/:id/comments")
  list(@Param("id") postId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.comments.list(postId, user)
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("posts/:id/comments")
  create(@Param("id") postId: string, @Body() dto: CreateCommentDto, @CurrentUser() user: AuthenticatedUser) {
    return this.comments.create(postId, dto, user)
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Delete("comments/:id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.comments.remove(id, user)
  }
}
