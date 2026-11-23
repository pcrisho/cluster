import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { ModuleKey } from "@prisma/client"
import { CurrentUser, RequireModule, type AuthenticatedUser } from "../../common/decorators"
import { PostsService } from "./posts.service"
import { CreatePostDto } from "./dto/create-post.dto"
import { UpdatePostDto } from "./dto/update-post.dto"
import { CursorPaginationDto } from "./dto/cursor-pagination.dto"

@RequireModule(ModuleKey.CONNECT)
@Controller("connect")
export class PostsController {
  constructor(private readonly posts: PostsService) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("feed")
  feed(
    @Query() pagination: CursorPaginationDto,
    @Query("sort") sort: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.posts.getFeed(user.orgId, user.id, pagination.cursor, pagination.limit, sort === "recent" ? "recent" : "top")
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("posts")
  create(@Body() dto: CreatePostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.createPost(dto, user.id, user.orgId, user.role)
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch("posts/:id")
  update(@Param("id") id: string, @Body() dto: UpdatePostDto, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.updatePost(id, dto, user.id, user.orgId, user.role)
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Delete("posts/:id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.deletePost(id, user.id, user.orgId, user.role)
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("posts/:id/likes")
  likes(@Param("id") id: string, @Query() pagination: CursorPaginationDto, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.listLikes(id, user.orgId, pagination.cursor, pagination.limit)
  }

  @Post("posts/:id/like")
  @HttpCode(HttpStatus.OK)
  like(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.posts.toggleLike(id, user.id, user.orgId)
  }
}
