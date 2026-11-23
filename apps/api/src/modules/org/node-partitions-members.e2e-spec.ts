import { INestApplication } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { isolatedOrg, type IsolatedOrg } from "./node-partitions.helpers";

/** Node partitions, rules 4, 8 and 9: who needs a node, who may clear it, and area managers (task T4). */
describe("Node partitions: members, assignments and area managers (e2e)", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let org: IsolatedOrg;
  let roleA: string;
  let roleB: string;
  let foreign: TestActor;

  const invite = (who: TestActor, body: Record<string, unknown>) =>
    http.post("/api/v1/org/members").set(who.auth).send({
      email: `invitee-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      firstName: "Invited",
      lastName: "Person",
      ...body,
    });
  const assign = (userId: string, body: Record<string, unknown>) =>
    http.patch(`/api/v1/org/members/${userId}/assignment`).set(org.admin.auth).send(body);
  const setManager = (nodeId: string, managerId: string) =>
    http.patch(`/api/v1/org/areas/${nodeId}`).set(org.admin.auth).send({ managerId });
  const profileOf = (userId: string) => prisma.userProfile.findUniqueOrThrow({ where: { userId } });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    org = await isolatedOrg(app);
    roleA = (
      await prisma.position.create({
        data: { name: "Role A", organizationId: org.orgId, orgNodeId: org.nodes.a, createdById: org.admin.id },
      })
    ).id;
    roleB = (
      await prisma.position.create({
        data: { name: "Role B", organizationId: org.orgId, orgNodeId: org.nodes.b, createdById: org.admin.id },
      })
    ).id;
    foreign = await createActor(app, "zz-foreign-members", "ADMIN");
  });

  afterAll(async () => {
    // The instance switch is global to the test database: leave it off once this organization is off.
    await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
    await prisma.instanceSettings.update({ where: { id: 1 }, data: { nodeIsolationAllowed: false } });
    await app?.close();
  });

  describe("with isolation on", () => {
    it("a collaborator invited without a node is refused (NODE_REQUIRED)", async () => {
      const res = await invite(org.admin, { role: UserRole.COLLABORATOR }).expect(400);
      expect(res.body.code).toBe("NODE_REQUIRED");
    });

    it("a collaborator invited with a node and a position of that node gets both", async () => {
      const res = await invite(org.admin, { role: UserRole.COLLABORATOR, orgNodeId: org.nodes.a, positionId: roleA }).expect(201);
      const profile = await profileOf(res.body.member.id);
      expect(profile.orgNodeId).toBe(org.nodes.a);
      expect(profile.positionId).toBe(roleA);
      expect(res.body.member.profile.orgNode.id).toBe(org.nodes.a);
    });

    it("a collaborator with a position scoped to another node is refused (POSITION_INCOMPATIBLE)", async () => {
      const res = await invite(org.admin, { role: UserRole.COLLABORATOR, orgNodeId: org.nodes.a, positionId: roleB }).expect(400);
      expect(res.body.code).toBe("POSITION_INCOMPATIBLE");
    });

    it("an unknown or foreign node is refused (ORG_NODE_NOT_FOUND)", async () => {
      const res = await invite(org.admin, {
        role: UserRole.COLLABORATOR,
        orgNodeId: "00000000-0000-4000-8000-000000000000",
      }).expect(400);
      expect(res.body.code).toBe("ORG_NODE_NOT_FOUND");
    });

    it("an ADMIN is invited without a node (crossers need none)", async () => {
      await invite(org.admin, { role: UserRole.ADMIN }).expect(201);
    });

    it("an ADMIN cannot clear a collaborator's node (NODE_REQUIRED), but can move them to another main node", async () => {
      const res = await assign(org.a.id, { orgNodeId: null }).expect(400);
      expect(res.body.code).toBe("NODE_REQUIRED");
      expect((await profileOf(org.a.id)).orgNodeId).toBe(org.nodes.a);
    });

    it("clearing the node of a crosser is allowed", async () => {
      await prisma.userProfile.create({
        data: { userId: org.courseManager.id, organizationId: org.orgId, orgNodeId: org.nodes.a },
      });
      await assign(org.courseManager.id, { orgNodeId: null }).expect(200);
      expect((await profileOf(org.courseManager.id)).orgNodeId).toBeNull();
    });

    it("a manager of a node in another main node is refused (MANAGER_OTHER_PARTITION)", async () => {
      const res = await setManager(org.nodes.areaA, org.b.id).expect(409);
      expect(res.body.code).toBe("MANAGER_OTHER_PARTITION");
      const child = await http
        .post("/api/v1/org/areas")
        .set(org.admin.auth)
        .send({ name: "Area under A", parentId: org.nodes.a, managerId: org.b.id })
        .expect(409);
      expect(child.body.code).toBe("MANAGER_OTHER_PARTITION");
    });

    it("a crosser or a member of the same main node may manage an area", async () => {
      await setManager(org.nodes.areaA, org.admin.id).expect(200);
      await setManager(org.nodes.areaA, org.a.id).expect(200);
      // The crosser who was manager is free again; a crosser may manage a new area of another main node.
      await http
        .post("/api/v1/org/areas")
        .set(org.admin.auth)
        .send({ name: "Area under B", parentId: org.nodes.b, managerId: org.admin.id })
        .expect(201);
    });

    it("a new root can only be managed by a crosser (its partition is empty)", async () => {
      await http
        .post("/api/v1/org/areas")
        .set(org.admin.auth)
        .send({ name: "Client Root New", managerId: org.b.id })
        .expect(409);
      await http
        .post("/api/v1/org/areas")
        .set(org.admin.auth)
        .send({ name: "Client Root New", managerId: org.moderator.id })
        .expect(201);
    });

    it("moving a collaborator to another main node is allowed and audited", async () => {
      // a managed Area A in the test above; a manager cannot leave the partition of the area they manage.
      await setManager(org.nodes.areaA, org.courseManager.id).expect(200);
      await assign(org.a.id, { orgNodeId: org.nodes.b }).expect(200);
      expect((await profileOf(org.a.id)).orgNodeId).toBe(org.nodes.b);
      const row = await prisma.auditLog.findFirst({
        where: { organizationId: org.orgId, action: "UserProfile.SET_ASSIGNMENT", entityId: org.a.id },
        orderBy: { createdAt: "desc" },
      });
      expect(row?.newValues).toMatchObject({ orgNodeId: org.nodes.b });
    });

    it("another organization's ADMIN cannot assign people of this organization (404)", async () => {
      await http
        .patch(`/api/v1/org/members/${org.b.id}/assignment`)
        .set(foreign.auth)
        .send({ orgNodeId: null })
        .expect(404);
      expect((await profileOf(org.b.id)).orgNodeId).toBe(org.nodes.b);
    });
  });

  describe("with the organization switch off", () => {
    beforeAll(async () => {
      await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
    });

    it("a collaborator may be invited without a node", async () => {
      await invite(org.admin, { role: UserRole.COLLABORATOR }).expect(201);
    });

    it("a manager of another main node is allowed", async () => {
      // `nobody` has no node: under isolation no one outside B may manage B's area.
      await setManager(org.nodes.areaB, org.nobody.id).expect(200);
    });

    it("clearing a collaborator's node is allowed", async () => {
      await assign(org.b.id, { orgNodeId: null }).expect(200);
      expect((await profileOf(org.b.id)).orgNodeId).toBeNull();
    });
  });
});
