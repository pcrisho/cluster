import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { Capability, Prisma, UserRole } from "@prisma/client"
import { audit, diff } from "../../common/audit.helper"
import { bestEffort } from "../../common/best-effort"
import type { ActorContext } from "../../common/decorators"
import { StorageService } from "../storage/storage.service"
import { isOwnUploadKey } from "../storage/file-url"
import { loadInstanceSettings } from "../../common/instance-settings"
import { canCustomize, seedsOf, themeData } from "../../common/theme"
import type { ThemeDto } from "../../common/theme.dto"
import type { Seeds } from "@cluster/theme"
import { slugify } from "../../common/slugify"
import { AuthService } from "../auth/auth.service"
import { SessionService } from "../auth/session.service"
import { MfaService } from "../auth/mfa.service"
import { AuthEventsService } from "../auth/auth-events.service"
import { SecurityMailService } from "../auth/security-mail.service"
import { InvitationService } from "../auth/invitation.service"
import { UNUSABLE_PASSWORD } from "../auth/password-hash"
import { isolationBlocksModule } from "./partition"
import { PartitionService } from "./partition.service"
import { CollabClient } from "../collab/collab.client"
import {
  ActivityQueryDto,
  CreateMemberDto,
  ListMembersQueryDto,
  UpdateMemberDto,
  UpdateOrganizationDto,
} from "./dto/organization.dto"

const MEMBER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  isActive: true,
  avatarUrl: true,
  isSuperAdmin: true,
  passwordSetAt: true,
  createdAt: true,
  orgColaboratorId: true,
  profile: {
    select: {
      phone: true,
      birthDate: true,
      joinedAt: true,
      orgNode: { select: { id: true, name: true } },
      position: { select: { id: true, name: true } },
    },
  },
} as const

const ORG_SELECT = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  logoUrl: true,
  locale: true,
  createdAt: true,
  enabledModules: true,
  requireAdminMfa: true,
  memberProfileEditing: true,
} as const

/** Tenant administration (ADMIN of the organization): settings, modules and members. */
@Injectable()
export class OrganizationService {
  private readonly logger = new Logger(OrganizationService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly invitations: InvitationService,
    private readonly collab: CollabClient,
    private readonly storage: StorageService,
    private readonly sessions: SessionService,
    private readonly mfa: MfaService,
    private readonly authEvents: AuthEventsService,
    private readonly securityMail: SecurityMailService,
    private readonly partitions: PartitionService,
  ) {}

  async get(orgId: string) {
    const [{ isolateRootNodes, ...org }, memberCount, settings, peopleWithoutNode] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { ...ORG_SELECT, isolateRootNodes: true },
      }),
      this.prisma.user.count({ where: { organizationId: orgId, isActive: true } }),
      loadInstanceSettings(this.prisma),
      // Active people who are neither crossers (ADMIN, MANAGER, course managers, superadmin) nor placed in a node.
      this.prisma.user.count({
        where: {
          organizationId: orgId,
          isActive: true,
          isSuperAdmin: false,
          role: UserRole.COLLABORATOR,
          capabilities: { none: { capability: Capability.GROW_COURSE_MANAGE } },
          OR: [{ profile: { is: null } }, { profile: { is: { orgNodeId: null } } }],
        },
      }),
    ])
    return {
      ...org,
      memberCount,
      availableModules: settings.availableModules,
      isolation: { allowed: settings.nodeIsolationAllowed, enabled: isolateRootNodes, peopleWithoutNode },
    }
  }

  async update(actor: ActorContext, dto: UpdateOrganizationDto) {
    const { orgId } = actor
    const settings = await loadInstanceSettings(this.prisma)
    if (dto.enabledModules) {
      const { availableModules } = settings
      const unavailable = dto.enabledModules.filter((m) => !availableModules.includes(m))
      if (unavailable.length > 0) {
        throw new BadRequestException(
          `Modules not available on this instance: ${unavailable.join(", ")}`,
        )
      }
    }
    if (dto.isolateRootNodes === true && !settings.nodeIsolationAllowed) {
      throw new ForbiddenException({
        code: "ISOLATION_NOT_ALLOWED",
        message: "The instance does not allow isolating main nodes",
      })
    }
    if (dto.logoUrl && !isOwnUploadKey(orgId, dto.logoUrl)) {
      throw new BadRequestException("Images must be uploaded through /files/images")
    }
    const before = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        name: true,
        slug: true,
        timezone: true,
        logoUrl: true,
        locale: true,
        enabledModules: true,
        requireAdminMfa: true,
        memberProfileEditing: true,
        isolateRootNodes: true,
      },
    })
    // Isolation is effective only with the instance switch, and CONNECT and LIFE cannot run isolated.
    const isolated = settings.nodeIsolationAllowed && (dto.isolateRootNodes ?? before.isolateRootNodes)
    if (isolationBlocksModule(isolated, dto.enabledModules ?? before.enabledModules)) {
      throw new ConflictException({
        code: "ISOLATION_MODULES",
        message: "CONNECT and LIFE cannot be enabled while the organization isolates its main nodes",
      })
    }
    // The identifier follows the name; a name with no Latin letters leaves it as it is.
    const slug = dto.name !== undefined ? slugify(dto.name) : ""
    const data = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(slug && { slug }),
      ...(dto.timezone !== undefined && { timezone: dto.timezone }),
      ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
      ...(dto.locale !== undefined && { locale: dto.locale }),
      ...(dto.enabledModules !== undefined && { enabledModules: dto.enabledModules }),
      ...(dto.requireAdminMfa !== undefined && { requireAdminMfa: dto.requireAdminMfa }),
      ...(dto.memberProfileEditing !== undefined && { memberProfileEditing: dto.memberProfileEditing }),
    }
    const { oldValues, newValues } = diff(before, data)
    // The isolation switch has its own audit action, not a generic Organization.UPDATE.
    const isolation = diff(
      { isolateRootNodes: before.isolateRootNodes },
      dto.isolateRootNodes !== undefined ? { isolateRootNodes: dto.isolateRootNodes } : {},
    )
    if (Object.keys(newValues).length > 0 || Object.keys(isolation.newValues).length > 0) {
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.organization.update({
            where: { id: orgId },
            data: { ...data, ...(dto.isolateRootNodes !== undefined && { isolateRootNodes: dto.isolateRootNodes }) },
          })
          if (Object.keys(newValues).length > 0) {
            await audit(tx, {
              action: "Organization.UPDATE",
              actorId: actor.userId,
              organizationId: orgId,
              entityType: "Organization",
              entityId: orgId,
              oldValues,
              newValues,
              ipAddress: actor.ipAddress,
              userAgent: actor.userAgent,
            })
          }
          if (Object.keys(isolation.newValues).length > 0) {
            await audit(tx, {
              action: "Organization.SET_ISOLATION",
              actorId: actor.userId,
              organizationId: orgId,
              entityType: "Organization",
              entityId: orgId,
              oldValues: isolation.oldValues,
              newValues: isolation.newValues,
              ipAddress: actor.ipAddress,
              userAgent: actor.userAgent,
            })
          }
        })
      } catch (err) {
        // The only unique column an update can touch is the slug.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new ConflictException({
            code: "ORG_NAME_TAKEN",
            message: "An organization with a similar name already exists",
          })
        }
        throw err
      }
      const old = before.logoUrl
      if (old && "logoUrl" in newValues && isOwnUploadKey(orgId, old)) {
        await bestEffort("delete replaced logo", () => this.storage.deleteFile(old))
      }
    }
    return this.get(orgId)
  }

  /** Saves the organization's theme; only while the instance and the superadmin allow it. */
  async setTheme(actor: ActorContext, dto: ThemeDto): Promise<Seeds> {
    const { orgId } = actor
    const [org, settings] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: orgId },
        select: { brandPrimary: true, brandSecondary: true, fontKey: true, radiusKey: true, themingEnabled: true },
      }),
      loadInstanceSettings(this.prisma),
    ])
    if (!canCustomize(settings, org)) {
      throw new ForbiddenException({
        code: "ORG_THEMING_DISABLED",
        message: "Theme customization is disabled for this organization",
      })
    }
    const data = themeData(dto, seedsOf(org))
    // Diff against the stored columns, not the parsed seeds, so clearing a stored orphan shows in the audit.
    const { oldValues, newValues } = diff(org, data)
    const updated = await this.prisma.$transaction(async (tx) => {
      const row = await tx.organization.update({ where: { id: orgId }, data })
      if (Object.keys(newValues).length > 0) {
        await audit(tx, {
          action: "Organization.UPDATE",
          actorId: actor.userId,
          organizationId: orgId,
          entityType: "Organization",
          entityId: orgId,
          oldValues,
          newValues,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        })
      }
      return row
    })
    return seedsOf(updated)
  }

  /** The organization's audit log, newest first; `nextCursor` is the id to ask the next page with. */
  async activity(orgId: string, { cursor, limit = 20 }: ActivityQueryDto) {
    const rows = await this.prisma.auditLog.findMany({
      where: { organizationId: orgId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        oldValues: true,
        newValues: true,
        createdAt: true,
        actor: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    })
    const items = rows.slice(0, limit)
    return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null }
  }

  async listMembers(orgId: string, query: ListMembersQueryDto) {
    const terms = (query.q ?? "").trim().split(/\s+/).filter(Boolean)
    const where: Prisma.UserWhereInput = {
      organizationId: orgId,
      // Every word must appear in the name or the e-mail ("ana per" finds Ana Perez).
      AND: terms.map((term) => ({
        OR: [
          { firstName: { contains: term, mode: "insensitive" as const } },
          { lastName: { contains: term, mode: "insensitive" as const } },
          { email: { contains: term, mode: "insensitive" as const } },
        ],
      })),
      ...(query.orgNodeId ? { profile: { orgNodeId: query.orgNodeId } } : {}),
      ...(query.status === "DEACTIVATED" ? { isActive: false } : {}),
      ...(query.status === "ENABLED" ? { isActive: true } : {}),
      ...(query.status === "ACTIVE" ? { isActive: true, passwordSetAt: { not: null } } : {}),
      ...(query.status === "PENDING" ? { isActive: true, passwordSetAt: null } : {}),
    }
    const order = query.order ?? "asc"
    const byName = [{ firstName: order }, { lastName: order }]
    const pageSize = query.pageSize ?? 10
    const { members, total, page } = await this.prisma.$transaction(async (tx) => {
      const total = await tx.user.count({ where })
      const page = Math.min(query.page ?? 1, Math.max(1, Math.ceil(total / pageSize)))
      const members = await tx.user.findMany({
        where,
        select: MEMBER_SELECT,
        orderBy: [...(query.sort === "role" ? [{ role: order }] : []), ...byName, { id: "asc" as const }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      })
      return { members, total, page }
    })
    const withMfa = await this.mfa.enabledAmong(members.map((m) => m.id))
    return {
      total,
      page,
      pageSize,
      items: members.map((m) => ({ ...toMember(m), mfaEnabled: withMfa.has(m.id) })),
    }
  }

  async createMember(orgId: string, dto: CreateMemberDto) {
    // Rule 4 (docs/specs/org/node-partitions): under isolation a collaborator starts inside a main node.
    if (dto.role === UserRole.COLLABORATOR && !dto.orgNodeId && (await this.partitions.isolated(orgId))) {
      throw new BadRequestException({ code: "NODE_REQUIRED", message: "A collaborator needs an area" })
    }
    // Same checks as OrgNodeService.setUserAssignment, in the transaction that creates the profile.
    const user = await this.prisma.$transaction(async (tx) => {
      if (dto.orgNodeId) {
        const node = await tx.orgNode.findFirst({
          where: { id: dto.orgNodeId, organizationId: orgId, isActive: true },
          select: { id: true },
        })
        if (!node) {
          throw new BadRequestException({ code: "ORG_NODE_NOT_FOUND", message: "OrgNode not found or inactive" })
        }
      }
      if (dto.positionId) {
        const position = await tx.position.findFirst({
          where: { id: dto.positionId, organizationId: orgId },
          select: { orgNodeId: true, name: true, isActive: true },
        })
        if (!position || !position.isActive) throw new NotFoundException("Position not found or inactive")
        if (position.orgNodeId && position.orgNodeId !== (dto.orgNodeId ?? null)) {
          throw new BadRequestException({
            code: "POSITION_INCOMPATIBLE",
            message: `Position "${position.name}" is scoped to a different orgNode than the user's`,
          })
        }
      }
      const created = await this.auth.createAccount({ ...dto, organizationId: orgId }, tx)
      if (dto.orgNodeId || dto.positionId) {
        await tx.userProfile.create({
          data: {
            userId: created.id,
            organizationId: orgId,
            orgNodeId: dto.orgNodeId ?? null,
            positionId: dto.positionId ?? null,
          },
        })
      }
      return created
    })
    const inviteSent = await this.sendInvite(orgId, user)
    return { member: await this.getMember(orgId, user.id), inviteSent, mailEnabled: this.invitations.mailEnabled }
  }

  /**
   * Role, status and personal data of a member (docs/specs/org/member-data). An ADMIN edits their own data but
   * not their own role or status; the superadmin is out of a tenant ADMIN's reach. Every change is audited.
   */
  async updateMember(actor: ActorContext, memberId: string, dto: UpdateMemberDto) {
    const { orgId } = actor
    const isSelf = memberId === actor.userId
    // Prevents an admin from locking themselves (and possibly the org) out.
    if (isSelf && (dto.role !== undefined || dto.isActive !== undefined)) {
      throw new BadRequestException({ code: "OWN_MEMBERSHIP", message: "You cannot change your own role or status" })
    }
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId: orgId },
      select: {
        isSuperAdmin: true,
        passwordSetAt: true,
        role: true,
        isActive: true,
        firstName: true,
        lastName: true,
        email: true,
        orgColaboratorId: true,
        profile: { select: { phone: true, birthDate: true, joinedAt: true } },
      },
    })
    if (!member) throw new NotFoundException("Member not found")
    if (member.isSuperAdmin && !isSelf) {
      throw new ForbiddenException({
        code: "SUPERADMIN_PROTECTED",
        message: "The superadmin's account is managed by the instance operator",
      })
    }
    for (const day of [dto.birthDate, dto.joinedAt]) {
      // Days are stored as UTC midnight; the margin lets zones ahead of UTC enter their today.
      if (day && new Date(day).getTime() > Date.now() + 14 * 3_600_000) {
        throw new BadRequestException({ code: "DATE_IN_FUTURE", message: "The date cannot be in the future" })
      }
    }

    const before = {
      role: member.role,
      isActive: member.isActive,
      firstName: member.firstName,
      lastName: member.lastName,
      email: member.email,
      employeeCode: member.orgColaboratorId,
      phone: member.profile?.phone ?? null,
      birthDate: dayOf(member.profile?.birthDate),
      joinedAt: dayOf(member.profile?.joinedAt),
    }
    const after: Partial<typeof before> = {}
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      if (dto[key] !== undefined) Object.assign(after, { [key]: dto[key] })
    }
    if (after.phone === "") after.phone = null
    const { oldValues, newValues } = diff(before, after)
    if (Object.keys(newValues).length === 0) return this.getMember(orgId, memberId)

    if (newValues.employeeCode) {
      const holder = await this.prisma.user.findFirst({
        where: { organizationId: orgId, orgColaboratorId: newValues.employeeCode, id: { not: memberId } },
        select: { id: true },
      })
      if (holder) throw employeeCodeTaken()
    }
    const { employeeCode, phone, birthDate, joinedAt, ...userData } = newValues
    const profileData = {
      ...(phone !== undefined && { phone }),
      ...(birthDate !== undefined && { birthDate: birthDate && new Date(birthDate) }),
      ...(joinedAt !== undefined && { joinedAt: new Date(joinedAt!) }),
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: memberId },
          data: { ...userData, ...(employeeCode !== undefined && { orgColaboratorId: employeeCode }) },
        })
        if (Object.keys(profileData).length > 0) {
          await tx.userProfile.upsert({
            where: { userId: memberId },
            create: { userId: memberId, ...profileData },
            update: profileData,
          })
        }
        await audit(tx, {
          action: "User.UPDATE",
          actorId: actor.userId,
          organizationId: orgId,
          entityType: "User",
          entityId: memberId,
          oldValues,
          newValues,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        })
      })
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // The code was checked above, so a conflict is the e-mail (unique in the instance, other organizations
        // invisible here) unless two saves raced on the code.
        throw newValues.email
          ? new ConflictException({ code: "EMAIL_TAKEN", message: "Email already registered" })
          : employeeCodeTaken()
      }
      throw err
    }

    // A deactivated member, or one whose sign-in address changed, is signed out everywhere (reactivating them must
    // not revive old sessions); revoking rechecks their open editors. A role change changes what those editors may do.
    const emailChanged = newValues.email !== undefined
    const signOut = newValues.isActive === false || emailChanged
    const revoked =
      signOut && (await this.sessions.revokeAll(memberId, emailChanged ? "EMAIL_CHANGED" : "DEACTIVATED")) > 0
    if (!revoked) await bestEffort("collab recheck", () => this.collab.recheck({ scope: "user", id: memberId }))
    if (emailChanged) {
      // To the old address: the person learns of a change they did not make.
      await this.securityMail.notify(memberId, "emailChanged", actor, member.email)
      if (member.passwordSetAt === null) {
        await this.sendInvite(orgId, { id: memberId, email: newValues.email!, firstName: after.firstName ?? member.firstName })
      }
    }
    return this.getMember(orgId, memberId)
  }

  /**
   * Turns a member's 2FA off when they lost their device and their recovery codes (R-20). The password
   * goes too, and a link to set a new one is emailed: whoever talks the ADMIN into a reset with a stolen
   * password cannot then enroll their own phone. Every session ends. A superadmin's goes through the
   * operator command (`auth:reset-mfa`), never through a tenant ADMIN.
   */
  async resetMemberMfa(actor: ActorContext, memberId: string) {
    if (memberId === actor.userId) {
      throw new BadRequestException({ code: "OWN_MFA_RESET", message: "You cannot reset your own two-step verification" })
    }
    await this.getMember(actor.orgId, memberId)
    const { isSuperAdmin } = await this.prisma.user.findUniqueOrThrow({
      where: { id: memberId },
      select: { isSuperAdmin: true },
    })
    if (isSuperAdmin) {
      throw new ForbiddenException({
        code: "SUPERADMIN_PROTECTED",
        message: "The superadmin's two-step verification is reset by the instance operator",
      })
    }
    // Sessions first: a later failure never leaves one alive that the reset meant to end.
    await this.sessions.revokeAll(memberId, "MFA_CHANGED")
    const member = await this.prisma.user.update({
      where: { id: memberId },
      data: { passwordHash: UNUSABLE_PASSWORD },
      select: { id: true, email: true, firstName: true },
    })
    await this.mfa.remove(memberId)
    await audit(this.prisma, {
      action: "UserMfa.RESET",
      actorId: actor.userId,
      organizationId: actor.orgId,
      entityType: "UserMfa",
      entityId: memberId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    })
    await this.authEvents.record("MFA_RESET", {
      userId: memberId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      detail: { by: actor.userId },
    })
    // Best effort: if the email fails, "Forgot password" still gets them a link.
    await bestEffort(`2FA reset email to user ${memberId}`, () => this.invitations.sendMfaReset(member))
  }

  async resendInvite(orgId: string, memberId: string) {
    const member = await this.getMember(orgId, memberId)
    if (!member.invitationPending) {
      throw new BadRequestException({ code: "MEMBER_ACTIVE", message: "This member has already set a password" })
    }
    return { inviteSent: await this.sendInvite(orgId, member), mailEnabled: this.invitations.mailEnabled }
  }

  private async getMember(orgId: string, memberId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId: orgId },
      select: MEMBER_SELECT,
    })
    if (!member) throw new NotFoundException("Member not found")
    return toMember(member)
  }

  // The account exists even if SMTP fails; the admin can resend the invitation.
  private async sendInvite(
    orgId: string,
    user: { id: string; email: string; firstName: string },
  ): Promise<boolean> {
    const org = await this.prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: { name: true },
    })
    try {
      return await this.invitations.sendInvite(user, org.name)
    } catch (err) {
      this.logger.error(`Failed to send invitation to user ${user.id}`, err)
      return false
    }
  }
}

function toMember<T extends { passwordSetAt: Date | null; orgColaboratorId: string | null }>({
  passwordSetAt,
  orgColaboratorId,
  ...member
}: T) {
  return { ...member, employeeCode: orgColaboratorId, invitationPending: passwordSetAt === null }
}

/** `YYYY-MM-DD` of a day stored as UTC midnight. */
const dayOf = (date: Date | null | undefined) => date?.toISOString().slice(0, 10) ?? null

const employeeCodeTaken = () =>
  new ConflictException({ code: "EMPLOYEE_CODE_TAKEN", message: "Another member already has this employee code" })
