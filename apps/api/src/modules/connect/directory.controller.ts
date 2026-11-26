import { Controller, Get, Param, Query } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { ModuleKey } from "@prisma/client"
import { CurrentUser, RequireModule } from "../../common/decorators"
import { DirectoryService } from "./directory.service"
import { DirectoryQueryDto } from "./dto/directory-query.dto"

@RequireModule(ModuleKey.CONNECT)
@Controller("connect")
export class DirectoryController {
  constructor(private readonly directory: DirectoryService) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("directory")
  list(@Query() query: DirectoryQueryDto, @CurrentUser("orgId") orgId: string) {
    return this.directory.list(orgId, query)
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get("directory/:userId")
  profile(@Param("userId") userId: string, @CurrentUser("orgId") orgId: string) {
    return this.directory.profile(userId, orgId)
  }
}
