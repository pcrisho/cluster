import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { ModuleKey, UserRole } from "@prisma/client"
import { CurrentUser, RequireModule, Roles, type AuthenticatedUser } from "../../common/decorators"
import { CelebrationsService } from "./celebrations.service"
import { ToggleReactionDto, UpdateCelebrationsSettingsDto } from "./dto/celebrations.dto"

@RequireModule(ModuleKey.CONNECT)
@Controller("connect/celebrations")
export class CelebrationsController {
  constructor(private readonly celebrations: CelebrationsService) {}

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get("today")
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.celebrations.today(user.orgId, user.id)
  }

  @Post("reactions")
  @HttpCode(HttpStatus.OK)
  react(@Body() dto: ToggleReactionDto, @CurrentUser() user: AuthenticatedUser) {
    return this.celebrations.toggleReaction(user.id, user.orgId, dto.targetUserId, dto.type, dto.emoji)
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get("settings")
  getSettings(@CurrentUser("orgId") orgId: string) {
    return this.celebrations.getSettings(orgId)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch("settings")
  updateSettings(@Body() dto: UpdateCelebrationsSettingsDto, @CurrentUser("orgId") orgId: string) {
    return this.celebrations.updateSettings(orgId, dto)
  }
}
