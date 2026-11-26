import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { audit } from "../../common/audit.helper"
import type { ActorContext } from "../../common/decorators"
import { InvitationService } from "../auth/invitation.service"
import { SecurityMailService } from "../auth/security-mail.service"
import { isValidLifetime, lifetimeSeconds, type AccessPurpose } from "../auth/access-lifetimes"
import { generateInitialPassword } from "../auth/initial-password"
import { hashPassword } from "../auth/password-hash"
import type { IssueAccessDto } from "./dto/member-access.dto"

export type IssuedAccess = { url: string; expiresAt: Date } | { password: string; expiresAt: Date }

/**
 * An ADMIN hands a member their way in without e-mail (docs/specs/auth/access-without-mail). A pending
 * member (invitation not accepted) gets an INVITE link or an initial password; an active one a RESET link.
 */
@Injectable()
export class MemberAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationService,
    private readonly securityMail: SecurityMailService,
  ) {}

  async issue(actor: ActorContext, memberId: string, dto: IssueAccessDto): Promise<IssuedAccess> {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId: actor.orgId },
      select: { isSuperAdmin: true, isActive: true, passwordSetAt: true },
    })
    if (!member) throw new NotFoundException("Member not found")
    if (member.isSuperAdmin) {
      throw new ForbiddenException({
        code: "SUPERADMIN_PROTECTED",
        message: "The superadmin's account is managed by the instance operator",
      })
    }
    if (memberId === actor.userId) {
      throw new BadRequestException({ code: "ACCESS_SELF", message: "To change your own password, use your account" })
    }
    if (!member.isActive) {
      throw new ConflictException({ code: "MEMBER_INACTIVE", message: "This member is deactivated" })
    }
    const pending = member.passwordSetAt === null
    if (dto.kind === "password" && !pending) {
      throw new ConflictException({ code: "MEMBER_ACTIVE", message: "This member has already set a password" })
    }
    const purpose: AccessPurpose = pending ? "INVITE" : "RESET"
    if (!isValidLifetime(purpose, dto.lifetime)) {
      throw new BadRequestException({ code: "INVALID_LIFETIME", message: "That lifetime is not offered" })
    }

    const ttl = lifetimeSeconds(dto.lifetime)
    const expiresAt = new Date(Date.now() + ttl * 1000)
    let access: IssuedAccess
    if (dto.kind === "password") {
      const password = generateInitialPassword()
      await this.invitations.issueInitialPassword(memberId, await hashPassword(password), expiresAt)
      access = { password, expiresAt }
    } else {
      access = { url: await this.invitations.issueAccessLink(memberId, purpose, ttl), expiresAt }
    }

    await audit(this.prisma, {
      action: "User.ISSUE_ACCESS",
      actorId: actor.userId,
      organizationId: actor.orgId,
      entityType: "User",
      entityId: memberId,
      newValues: { kind: dto.kind, purpose, lifetime: dto.lifetime },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    })
    // A reset the person did not ask for: they hear of it (best effort, skipped when mail is off).
    if (dto.kind === "link" && purpose === "RESET") await this.securityMail.notify(memberId, "accessLinkCreated", actor)
    return access
  }
}
