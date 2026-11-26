import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from "@nestjs/common"
import { ModuleKey } from "@prisma/client"
import { Throttle } from "@nestjs/throttler"
import { Actor, CurrentUser, RequireModule, type ActorContext, type AuthenticatedUser } from "../../common/decorators"
import { PartitionService } from "../org/partition.service"
import { AddAccessDto, UpdateAccessDto } from "./dto/space-access.dto"
import { SpaceSharingService } from "./space-sharing.service"

@RequireModule(ModuleKey.KNOW)
@Controller("know/spaces/:spaceId/access")
export class SpaceSharingController {
  constructor(
    private readonly sharing: SpaceSharingService,
    private readonly partition: PartitionService,
  ) {}

  @Get()
  async list(@Param("spaceId") spaceId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.sharing.list(user, spaceId, await this.partition.scopeFor(user))
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post()
  async add(
    @Param("spaceId") spaceId: string,
    @Body() dto: AddAccessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.sharing.set(user, actor, spaceId, dto, await this.partition.scopeFor(user))
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch(":entryId")
  async setRole(
    @Param("spaceId") spaceId: string,
    @Param("entryId") entryId: string,
    @Body() dto: UpdateAccessDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.sharing.setRole(user, actor, spaceId, entryId, dto.role, await this.partition.scopeFor(user))
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Delete(":entryId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("spaceId") spaceId: string,
    @Param("entryId") entryId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    await this.sharing.remove(user, actor, spaceId, entryId, await this.partition.scopeFor(user))
  }
}
