import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common"
import { Actor, Public, SuperAdminOnly, type ActorContext } from "../../common/decorators"
import { InstanceService } from "./instance.service"
import {
  CreateOrganizationDto,
  UpdateInstanceSettingsDto,
  UpdateOrganizationStatusDto,
} from "./dto/instance.dto"

@Controller("instance")
export class InstanceController {
  constructor(private readonly instanceService: InstanceService) {}

  @Public()
  @Get("public")
  getPublicSettings() {
    return this.instanceService.getPublicSettings()
  }

  @SuperAdminOnly()
  @Get("settings")
  getSettings() {
    return this.instanceService.getSettings()
  }

  @SuperAdminOnly()
  @Patch("settings")
  updateSettings(@Actor() actor: ActorContext, @Body() dto: UpdateInstanceSettingsDto) {
    return this.instanceService.updateSettings(actor, dto)
  }

  @SuperAdminOnly()
  @Get("organizations")
  listOrganizations() {
    return this.instanceService.listOrganizations()
  }

  @SuperAdminOnly()
  @Post("organizations")
  createOrganization(@Body() dto: CreateOrganizationDto) {
    return this.instanceService.createOrganization(dto)
  }

  @SuperAdminOnly()
  @Patch("organizations/:id")
  updateOrganization(
    @Param("id") id: string,
    @Actor() actor: ActorContext,
    @Body() dto: UpdateOrganizationStatusDto,
  ) {
    return this.instanceService.updateOrganization(id, actor, dto)
  }
}
