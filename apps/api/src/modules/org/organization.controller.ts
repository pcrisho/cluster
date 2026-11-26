import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, Res, StreamableFile } from "@nestjs/common"
import { Throttle } from "@nestjs/throttler"
import type { Response } from "express"
import { ModuleKey, UserRole } from "@prisma/client"
import { Actor, CurrentUser, Roles, type ActorContext } from "../../common/decorators"
import { CapabilityService } from "./capability.service"
import { SetCapabilitiesDto } from "./dto/capabilities.dto"
import { ThemeDto } from "../../common/theme.dto"
import { OrganizationService } from "./organization.service"
import { MemberAccessService } from "./member-access.service"
import { InvitationQueueService } from "./invitation-queue.service"
import { AccessExportService } from "./access-export.service"
import { XLSX_MIME } from "./access-export"
import { ExportAccessDto } from "./dto/access-export.dto"
import { IssueAccessDto, QueueInvitationsDto } from "./dto/member-access.dto"
import { ActivityQueryDto, CreateMemberDto, ListMembersQueryDto, UpdateMemberDto, UpdateOrganizationDto } from "./dto/organization.dto"

/** Tenant administration for the caller's own organization. */
@Controller("org")
@Roles(UserRole.ADMIN)
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
    private readonly capabilityService: CapabilityService,
    private readonly memberAccess: MemberAccessService,
    private readonly invitationQueue: InvitationQueueService,
    private readonly accessExport: AccessExportService,
  ) {}

  @Get()
  get(@CurrentUser("orgId") orgId: string) {
    return this.organizationService.get(orgId)
  }

  @Patch()
  update(@Actor() actor: ActorContext, @Body() dto: UpdateOrganizationDto) {
    return this.organizationService.update(actor, dto)
  }

  @Patch("theme")
  setTheme(@Actor() actor: ActorContext, @Body() dto: ThemeDto) {
    return this.organizationService.setTheme(actor, dto)
  }

  @Get("activity")
  activity(@CurrentUser("orgId") orgId: string, @Query() query: ActivityQueryDto) {
    return this.organizationService.activity(orgId, query)
  }

  @Get("members")
  listMembers(@CurrentUser("orgId") orgId: string, @Query() query: ListMembersQueryDto) {
    return this.organizationService.listMembers(orgId, query)
  }

  @Post("members")
  createMember(@CurrentUser("orgId") orgId: string, @Body() dto: CreateMemberDto) {
    return this.organizationService.createMember(orgId, dto)
  }

  @Patch("members/:id")
  updateMember(@Actor() actor: ActorContext, @Param("id") memberId: string, @Body() dto: UpdateMemberDto) {
    return this.organizationService.updateMember(actor, memberId, dto)
  }

  @Delete("members/:id/mfa")
  @HttpCode(HttpStatus.NO_CONTENT)
  resetMemberMfa(@Actor() actor: ActorContext, @Param("id") memberId: string) {
    return this.organizationService.resetMemberMfa(actor, memberId)
  }

  @Get("capabilities")
  capabilities(@CurrentUser("modules") modules: ModuleKey[]) {
    return this.capabilityService.catalog(modules)
  }

  @Get("members/:id/capabilities")
  memberCapabilities(@CurrentUser("orgId") orgId: string, @Param("id") memberId: string) {
    return this.capabilityService.get(orgId, memberId)
  }

  @Put("members/:id/capabilities")
  setMemberCapabilities(
    @Actor() actor: ActorContext,
    @CurrentUser("modules") modules: ModuleKey[],
    @Param("id") memberId: string,
    @Body() dto: SetCapabilitiesDto,
  ) {
    return this.capabilityService.set(actor, memberId, dto.capabilities, modules)
  }

  /** The one answer carries a secret: it is never cached. */
  @Post("members/:id/access")
  @HttpCode(HttpStatus.OK)
  async issueAccess(
    @Actor() actor: ActorContext,
    @Param("id") memberId: string,
    @Body() dto: IssueAccessDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader("Cache-Control", "no-store")
    return this.memberAccess.issue(actor, memberId, dto)
  }

  /** The credentials workbook of a node's pending members: a secret, so never cached; ten a minute. */
  @Post("access-export")
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async exportAccess(
    @Actor() actor: ActorContext,
    @Body() dto: ExportAccessDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { file, skipped } = await this.accessExport.export(actor, dto)
    res.setHeader("Cache-Control", "no-store")
    res.setHeader("X-Skipped-Active", String(skipped))
    return new StreamableFile(file, { type: XLSX_MIME, disposition: 'attachment; filename="cluster-access.xlsx"' })
  }

  /** Queues the pending members of a node's subtree; the paced sender sends them (409 when mail is off). */
  @Post("invitations")
  @HttpCode(HttpStatus.OK)
  queueInvitations(@CurrentUser("orgId") orgId: string, @Body() dto: QueueInvitationsDto) {
    return this.invitationQueue.queue(orgId, dto.nodeId)
  }

  @Post("members/:id/resend-invite")
  @HttpCode(HttpStatus.OK)
  resendInvite(@CurrentUser("orgId") orgId: string, @Param("id") memberId: string) {
    return this.organizationService.resendInvite(orgId, memberId)
  }
}
