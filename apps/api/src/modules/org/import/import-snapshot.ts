import type { Prisma } from "@prisma/client"
import { ModuleKey } from "@prisma/client"
import { loadInstanceSettings } from "../../../common/instance-settings"
import type { ImportSnapshot, MemberSnapshot } from "./import-types"

const day = (date: Date) => date.toISOString().slice(0, 10)

/** What the planner cannot read from the organization's tables: switches and the other organizations' addresses. */
export interface SnapshotExtras {
  isolated: boolean
  emailsElsewhere: Set<string>
}

/**
 * Reads everything `planImport` needs, in the request's organization (RLS plus the explicit `organizationId`).
 * `db` is the transaction on apply, so the plan and the writes see the same data.
 */
export async function loadSnapshot(
  db: Prisma.TransactionClient,
  orgId: string,
  emails: string[],
  extras: SnapshotExtras,
): Promise<ImportSnapshot> {
  const nodes = await db.orgNode.findMany({
    where: { organizationId: orgId },
    select: { id: true, parentId: true, name: true, code: true, isActive: true, managerId: true },
  })
  const positions = await db.position.findMany({
    where: { organizationId: orgId },
    select: { id: true, name: true, orgNodeId: true, isActive: true },
  })
  const users = await db.user.findMany({
    where: { organizationId: orgId, email: { in: emails } },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isSuperAdmin: true,
      isActive: true,
      orgColaboratorId: true,
    },
  })
  // Flat reads, no nested relations: inside a transaction Prisma would run those in parallel on one connection (pg warns, pg@9 refuses).
  const ids = users.map((u) => u.id)
  const profiles = await db.userProfile.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, orgNodeId: true, positionId: true, joinedAt: true },
  })
  const grants = await db.userCapability.findMany({
    where: { userId: { in: ids } },
    select: { userId: true, capability: true },
  })
  const profileOf = new Map(profiles.map((p) => [p.userId, p]))
  const coded = await db.user.findMany({
    where: { organizationId: orgId, orgColaboratorId: { not: null } },
    select: { id: true, orgColaboratorId: true },
  })
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { enabledModules: true } })
  const settings = await loadInstanceSettings(db)

  const live = nodes.filter((n) => n.isActive && n.managerId)
  const managers = await db.user.findMany({
    where: { id: { in: live.map((n) => n.managerId as string) } },
    select: { id: true, firstName: true, lastName: true },
  })

  const managedBy = new Map(nodes.flatMap((n) => (n.managerId ? [[n.managerId, n.id] as const] : [])))
  const members = new Map<string, MemberSnapshot>(
    users.map((u) => [
      u.email,
      {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        isSuperAdmin: u.isSuperAdmin,
        isActive: u.isActive,
        employeeCode: u.orgColaboratorId,
        orgNodeId: profileOf.get(u.id)?.orgNodeId ?? null,
        positionId: profileOf.get(u.id)?.positionId ?? null,
        joinedAt: profileOf.has(u.id) ? day(profileOf.get(u.id)!.joinedAt) : null,
        capabilities: grants.filter((g) => g.userId === u.id).map((g) => g.capability),
        managesNodeId: managedBy.get(u.id) ?? null,
      },
    ]),
  )
  const know =
    (org?.enabledModules ?? []).includes(ModuleKey.KNOW) && settings.availableModules.includes(ModuleKey.KNOW)

  return {
    tree: nodes.map(({ id, parentId, name, code, isActive }) => ({ id, parentId, name, code, isActive })),
    managerOf: new Map(live.map((n) => [n.id, n.managerId as string])),
    managerNames: new Map(managers.map((m) => [m.id, `${m.firstName} ${m.lastName}`])),
    positions,
    members,
    employeeCodes: new Map(coded.map((u) => [u.orgColaboratorId as string, u.id])),
    emailsElsewhere: extras.emailsElsewhere,
    isolated: extras.isolated,
    knowEnabled: know,
  }
}
