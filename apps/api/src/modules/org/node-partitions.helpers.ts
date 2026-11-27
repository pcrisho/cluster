import type { INestApplication } from "@nestjs/common";
import { Capability, ModuleKey, UserRole } from "@prisma/client";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, type TestActor } from "../../test-helpers";

export interface IsolatedOrg {
  orgId: string;
  /** Main nodes (no parent) and their child areas. */
  nodes: { a: string; b: string; areaA: string; areaB: string };
  /** Tenant ADMIN without a node (crosser). */
  admin: TestActor;
  /** MANAGER without a node (crosser, shown as Moderator). */
  moderator: TestActor;
  /** COLLABORATOR with GROW_COURSE_MANAGE and no node (crosser). */
  courseManager: TestActor;
  /** COLLABORATOR in main node A. */
  a: TestActor;
  /** COLLABORATOR in main node B. */
  b: TestActor;
  /** COLLABORATOR without a node (non-crosser, sees nobody). */
  nobody: TestActor;
}

/**
 * An organization with both isolation switches on: the instance switch is set directly in the database,
 * so a test that uses this must restore it to false in afterAll (it is global to the test database).
 */
export async function isolatedOrg(
  app: INestApplication,
  enabledModules: ModuleKey[] = [ModuleKey.KNOW, ModuleKey.GROW],
): Promise<IsolatedOrg> {
  const prisma = app.get(SystemPrismaService);
  await prisma.instanceSettings.upsert({
    where: { id: 1 },
    create: { nodeIsolationAllowed: true },
    update: { nodeIsolationAllowed: true },
  });
  const slug = `iso-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // LIFE cannot run isolated (ISOLATION_MODULES), so the organization starts without it.
  const org = await prisma.organization.create({
    data: {
      name: slug,
      slug,
      isolateRootNodes: true,
      enabledModules,
    },
  });
  const orgId = org.id;

  const node = (name: string, parentId: string | null) =>
    prisma.orgNode.create({ data: { name, parentId, organizationId: orgId } });
  const a = await node("Client A", null);
  const b = await node("Client B", null);
  const areaA = await node("Area A", a.id);
  const areaB = await node("Area B", b.id);

  const member = async (
    name: string,
    role: UserRole,
    orgNodeId: string | null,
    capability?: Capability,
  ) => {
    const actor = await createActor(app, name, role, orgId);
    if (orgNodeId) {
      await prisma.userProfile.create({
        data: { userId: actor.id, organizationId: orgId, orgNodeId },
      });
    }
    if (capability) {
      await prisma.userCapability.create({
        data: {
          userId: actor.id,
          organizationId: orgId,
          capability,
          grantedById: actor.id,
        },
      });
    }
    return actor;
  };

  return {
    orgId,
    nodes: { a: a.id, b: b.id, areaA: areaA.id, areaB: areaB.id },
    admin: await member("iso-admin", "ADMIN", null),
    moderator: await member("iso-moderator", "MANAGER", null),
    courseManager: await member(
      "iso-course-manager",
      "COLLABORATOR",
      null,
      Capability.GROW_COURSE_MANAGE,
    ),
    a: await member("iso-a", "COLLABORATOR", a.id),
    b: await member("iso-b", "COLLABORATOR", b.id),
    nobody: await member("iso-nobody", "COLLABORATOR", null),
  };
}
