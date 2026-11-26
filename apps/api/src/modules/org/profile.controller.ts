import { Body, Controller, Get, HttpCode, HttpStatus, Patch } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators"
import { ProfileService } from "./profile.service"
import { UpdateMyProfileDto } from "./dto/update-profile.dto"

/** Core (not gated by any module): every module may show the user's area/position. */
@Controller("profile")
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get("me")
  getMine(@CurrentUser("id") userId: string) {
    return this.profileService.getMine(userId)
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch("me")
  @HttpCode(HttpStatus.OK)
  updateMine(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateMyProfileDto) {
    return this.profileService.updateMine(user, dto)
  }
}
