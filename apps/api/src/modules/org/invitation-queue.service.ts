import { ConflictException, Injectable, NotFoundException } from "@nestjs/common"
import { PrismaService } from "../../prisma/prisma.service"
import { InvitationService } from "../auth/invitation.service"
import { subtreeMemberIds } from "./org-subtree"

/** Queues the pending members of a node's subtree for the paced sender (docs/specs/auth/access-without-mail). */
@Injectable()
export class InvitationQueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationService,
  ) {}

  async queue(orgId: string, nodeId: string): Promise<{ queued: number }> {
    if (!this.invitations.mailEnabled) {
      throw new ConflictException({ code: "MAIL_DISABLED", message: "E-mail is off on this instance" })
    }
    const ids = await subtreeMemberIds(this.prisma, orgId, nodeId)
    if (ids === null) throw new NotFoundException("Node not found")
    // Pending and active only; a member already queued keeps its place.
    const { count } = await this.prisma.user.updateMany({
      where: { organizationId: orgId, id: { in: ids }, passwordSetAt: null, isActive: true, inviteQueuedAt: null },
      data: { inviteQueuedAt: new Date() },
    })
    return { queued: count }
  }
}
