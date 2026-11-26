import { Injectable, NotFoundException } from "@nestjs/common"
import { Prisma } from "@prisma/client"
import { audit } from "../../common/audit.helper"
import { bestEffort } from "../../common/best-effort"
import type { ActorContext, AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { CollabClient } from "../collab/collab.client"
import { principalOf, PrincipalType } from "../org/principal"
import type { PartitionScope } from "../org/partition"
import { PrincipalService } from "../org/principal.service"
import { AddAccessDto } from "./dto/space-access.dto"
import { entryInScope } from "./space-sharing-scope"
import { SpaceAccessService } from "./space-access.service"

// The profile node and position node decide the partition of an entry (node-partitions rule 7); they are not returned.
const ENTRY_INCLUDE = {
  user: { select: { firstName: true, lastName: true, email: true, profile: { select: { orgNodeId: true } } } },
  orgNode: { select: { name: true, parentId: true } },
  position: { select: { name: true, orgNodeId: true } },
} satisfies Prisma.SpaceAccessInclude

type EntryRow = Prisma.SpaceAccessGetPayload<{ include: typeof ENTRY_INCLUDE }>

function toEntry(row: EntryRow) {
  return { id: row.id, role: row.role, principal: principalOf(row) }
}

/** Managers of a space (and ADMIN) edit who can see and change it. */
@Injectable()
export class SpaceSharingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly collab: CollabClient,
    private readonly principals: PrincipalService,
  ) {}

  /** Who can open which page changed: open editors are re-authorized (best effort). */
  private recheck() {
    return bestEffort("collab recheck", () => this.collab.recheck({ scope: "all" }))
  }

  /** Entries outside the caller's scope are left out and counted in `hiddenCount`. */
  async list(user: AuthenticatedUser, spaceId: string, scope: PartitionScope) {
    await this.access.requireSpace(user, spaceId, "MANAGE")
    const space = await this.prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { restricted: true } })
    const rows = await this.prisma.spaceAccess.findMany({
      where: { spaceId },
      include: ENTRY_INCLUDE,
      orderBy: { createdAt: "asc" },
    })
    const shown = rows.filter((row) => entryInScope(scope, row))
    return { restricted: space.restricted, entries: shown.map(toEntry), hiddenCount: rows.length - shown.length }
  }

  /** Adds the principal, or changes its role when it already has an entry. */
  async set(user: AuthenticatedUser, actor: ActorContext, spaceId: string, dto: AddAccessDto, scope: PartitionScope) {
    await this.access.requireSpace(user, spaceId, "MANAGE")
    await this.principals.assertActive(user.orgId, dto.principalType, dto.principalId, scope)

    const id = dto.principalId
    const create = (field: "userId" | "orgNodeId" | "positionId") => ({
      spaceId,
      role: dto.role,
      [field]: id,
      createdById: user.id,
    })
    const row = await this.prisma.$transaction(async (tx) => {
      const saved =
        dto.principalType === PrincipalType.USER
          ? await tx.spaceAccess.upsert({
              where: { spaceId_userId: { spaceId, userId: id } },
              create: create("userId"),
              update: { role: dto.role },
              include: ENTRY_INCLUDE,
            })
          : dto.principalType === PrincipalType.ORG_NODE
            ? await tx.spaceAccess.upsert({
                where: { spaceId_orgNodeId: { spaceId, orgNodeId: id } },
                create: create("orgNodeId"),
                update: { role: dto.role },
                include: ENTRY_INCLUDE,
              })
            : await tx.spaceAccess.upsert({
                where: { spaceId_positionId: { spaceId, positionId: id } },
                create: create("positionId"),
                update: { role: dto.role },
                include: ENTRY_INCLUDE,
              })
      await this.audit(tx, actor, "SpaceAccess.SET", saved.id, { spaceId, principalType: dto.principalType, principalId: id, role: dto.role })
      return saved
    })
    await this.recheck()
    return toEntry(row)
  }

  async setRole(
    user: AuthenticatedUser,
    actor: ActorContext,
    spaceId: string,
    entryId: string,
    role: AddAccessDto["role"],
    scope: PartitionScope,
  ) {
    await this.access.requireSpace(user, spaceId, "MANAGE")
    await this.assertEntry(spaceId, entryId, scope)
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.spaceAccess.update({ where: { id: entryId }, data: { role }, include: ENTRY_INCLUDE })
      await this.audit(tx, actor, "SpaceAccess.SET", entryId, { spaceId, role })
      return saved
    })
    await this.recheck()
    return toEntry(row)
  }

  async remove(user: AuthenticatedUser, actor: ActorContext, spaceId: string, entryId: string, scope: PartitionScope) {
    await this.access.requireSpace(user, spaceId, "MANAGE")
    await this.assertEntry(spaceId, entryId, scope)
    await this.prisma.$transaction(async (tx) => {
      await tx.spaceAccess.delete({ where: { id: entryId } })
      await this.audit(tx, actor, "SpaceAccess.REMOVE", entryId, { spaceId })
    })
    await this.recheck()
  }

  /** An entry of this space that the caller may see; one outside their scope is as missing as an unknown one. */
  private async assertEntry(spaceId: string, entryId: string, scope: PartitionScope) {
    const entry = await this.prisma.spaceAccess.findFirst({ where: { id: entryId, spaceId }, include: ENTRY_INCLUDE })
    if (!entry || !entryInScope(scope, entry)) throw new NotFoundException("Access entry not found")
  }

  private audit(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    action: "SpaceAccess.SET" | "SpaceAccess.REMOVE",
    entityId: string,
    values: Record<string, unknown>,
  ) {
    return audit(tx, {
      action,
      actorId: actor.userId,
      organizationId: actor.orgId,
      entityType: "SpaceAccess",
      entityId,
      newValues: values,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    })
  }
}
