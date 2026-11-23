import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import { UserRole } from "@prisma/client"
import { Actor, CurrentUser, Roles, type ActorContext, type AuthenticatedUser } from "../../common/decorators"
import { OrgNodeService } from "./org-node.service"
import { PartitionService } from "./partition.service"
import { PositionService } from "./position.service"
import { PrincipalService } from "./principal.service"
import { CreateOrgNodeDto } from "./dto/create-org-node.dto"
import { UpdateOrgNodeDto } from "./dto/update-org-node.dto"
import { MoveOrgNodeDto } from "./dto/move-org-node.dto"
import { CreatePositionDto } from "./dto/create-position.dto"
import { UpdatePositionDto } from "./dto/update-position.dto"
import { SetUserAssignmentDto } from "./dto/set-user-assignment.dto"

/**
 * Organization structure: areas (the org chart), positions and who holds them.
 * Core, not tied to any feature module: every member can read, only admins change.
 * No @RequireModule on purpose, so it keeps working when CONNECT is switched off.
 */
@Controller("org")
export class OrgStructureController {
  constructor(
    private readonly areas: OrgNodeService,
    private readonly positions: PositionService,
    private readonly principals: PrincipalService,
    private readonly partition: PartitionService,
  ) {}

  // ─── Principals ─────────────────────────────────────────

  /** People, areas and positions to grant something to (KNOW sharing, GROW assignments). */
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("principals")
  async searchPrincipals(@CurrentUser() user: AuthenticatedUser, @Query("q") q: string | undefined) {
    return this.principals.search(user.orgId, q ?? "", await this.partition.scopeFor(user))
  }

  // ─── Areas ──────────────────────────────────────────────

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("areas")
  async listAreas(@CurrentUser() user: AuthenticatedUser) {
    return this.areas.getTree(user.orgId, await this.partition.scopeFor(user))
  }

  /** Areas with their positions and member counts, for the admin editor. */
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("areas/full")
  listAreasWithPositions(@CurrentUser("orgId") orgId: string) {
    return this.areas.getFullTree(orgId)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("areas")
  createArea(@Body() dto: CreateOrgNodeDto, @Actor() actor: ActorContext) {
    return this.areas.create(actor.orgId, dto, actor)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch("areas/:id")
  updateArea(@Param("id") id: string, @Body() dto: UpdateOrgNodeDto, @Actor() actor: ActorContext) {
    return this.areas.update(actor.orgId, id, dto, actor)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch("areas/:id/move")
  moveArea(@Param("id") id: string, @Body() dto: MoveOrgNodeDto, @Actor() actor: ActorContext) {
    return this.areas.move(actor.orgId, id, dto, actor)
  }

  /** Archives the area; its members move to `reassignTo`. */
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Delete("areas/:id")
  @HttpCode(HttpStatus.OK)
  archiveArea(
    @Param("id") id: string,
    @Query("reassignTo", ParseUUIDPipe) reassignTo: string,
    @Actor() actor: ActorContext,
  ) {
    return this.areas.archive(actor.orgId, id, reassignTo, actor)
  }

  // ─── Positions ──────────────────────────────────────────

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("positions")
  async listPositions(@CurrentUser() user: AuthenticatedUser, @Query("includeInactive") includeInactive?: string) {
    return this.positions.list(
      user.orgId,
      includeInactive === "true" && user.role === UserRole.ADMIN,
      await this.partition.scopeFor(user),
    )
  }

  /** Global positions plus the ones scoped to this area. */
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("positions/for-area/:areaId")
  listPositionsForArea(@Param("areaId") areaId: string, @CurrentUser("orgId") orgId: string) {
    return this.positions.listAvailableForNode(orgId, areaId)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("positions")
  createPosition(@Body() dto: CreatePositionDto, @Actor() actor: ActorContext) {
    return this.positions.create(actor.orgId, dto, actor)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch("positions/:id")
  updatePosition(@Param("id") id: string, @Body() dto: UpdatePositionDto, @Actor() actor: ActorContext) {
    return this.positions.update(actor.orgId, id, dto, actor)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("positions/:id/archive")
  @HttpCode(HttpStatus.OK)
  archivePosition(@Param("id") id: string, @Actor() actor: ActorContext) {
    return this.positions.archive(actor.orgId, id, actor)
  }

  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Delete("positions/:id")
  @HttpCode(HttpStatus.OK)
  deletePosition(@Param("id") id: string, @Actor() actor: ActorContext) {
    return this.positions.delete(actor.orgId, id, actor)
  }

  // ─── Assignment ─────────────────────────────────────────

  /** Sets a member's area and/or position (only admins assign them). */
  @Roles(UserRole.ADMIN)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Patch("members/:userId/assignment")
  setAssignment(
    @Param("userId") userId: string,
    @Body() dto: SetUserAssignmentDto,
    @Actor() actor: ActorContext,
  ) {
    return this.areas.setUserAssignment(actor.orgId, userId, dto, actor)
  }
}
