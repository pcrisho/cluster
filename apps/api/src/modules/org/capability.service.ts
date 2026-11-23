import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common"
import { Capability, ModuleKey } from "@prisma/client"
import { audit } from "../../common/audit.helper"
import type { ActorContext } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { CAPABILITY_MODULE } from "./capabilities"

@Injectable()
export class CapabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /** Capabilities of the enabled modules, for the admin screen. */
  catalog(modules: ModuleKey[]) {
    return (Object.keys(CAPABILITY_MODULE) as Capability[])
      .filter((capability) => modules.includes(CAPABILITY_MODULE[capability]))
      .map((capability) => ({ capability, module: CAPABILITY_MODULE[capability] }))
  }

  async get(orgId: string, memberId: string) {
    await this.assertMember(orgId, memberId)
    const rows = await this.prisma.userCapability.findMany({
      where: { userId: memberId },
      select: { capability: true },
      orderBy: { capability: "asc" },
    })
    return { capabilities: rows.map((r) => r.capability) }
  }

  /** Replaces the member's whole set. */
  async set(actor: ActorContext, memberId: string, requested: Capability[], modules: ModuleKey[]) {
    await this.assertMember(actor.orgId, memberId)
    const capabilities = [...new Set(requested)]
    const disabled = capabilities.filter((c) => !modules.includes(CAPABILITY_MODULE[c]))
    if (disabled.length > 0) {
      throw new BadRequestException(`The module of ${disabled.join(", ")} is not enabled`)
    }

    const before = await this.get(actor.orgId, memberId)
    await this.prisma.$transaction(async (tx) => {
      await tx.userCapability.deleteMany({ where: { userId: memberId } })
      await tx.userCapability.createMany({
        data: capabilities.map((capability) => ({ userId: memberId, capability, grantedById: actor.userId })),
      })
      await audit(tx, {
        action: "UserCapability.SET",
        actorId: actor.userId,
        organizationId: actor.orgId,
        entityType: "UserCapability",
        entityId: memberId,
        oldValues: { capabilities: before.capabilities },
        newValues: { capabilities },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      })
    })
    return this.get(actor.orgId, memberId)
  }

  private async assertMember(orgId: string, memberId: string) {
    const member = await this.prisma.user.findFirst({
      where: { id: memberId, organizationId: orgId },
      select: { id: true },
    })
    if (!member) throw new NotFoundException("Member not found")
  }
}
