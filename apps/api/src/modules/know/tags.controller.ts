import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { CreateTagDto } from "./dto/create-tag.dto";
import { TagsService } from "./tags.service";

@RequireModule(ModuleKey.KNOW)
@Controller("know/tags")
export class TagsController {
  constructor(private readonly tags: TagsService) {}

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get()
  list(@CurrentUser("orgId") orgId: string) {
    return this.tags.list(orgId);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post()
  create(@Body() dto: CreateTagDto, @CurrentUser() user: AuthenticatedUser) {
    return this.tags.create(user, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.tags.remove(user, id);
  }
}
