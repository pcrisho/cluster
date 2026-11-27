import { Controller, Get, Param, Query } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { ModuleKey } from "@prisma/client"
import { CurrentUser, RequireModule, type AuthenticatedUser } from "../../common/decorators"
import { DirectoryService } from "./directory.service"
import { DirectoryQueryDto } from "./dto/directory-query.dto"

@RequireModule(ModuleKey.CONNECT)
@Controller("connect")
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("directory")
  list(@Query() query: DirectoryQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.directory.list(user, query)
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get("directory/:userId")
  profile(@Param("userId") userId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.directory.profile(userId, user)
  }
}
