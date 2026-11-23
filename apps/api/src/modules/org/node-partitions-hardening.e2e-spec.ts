import { INestApplication } from "@nestjs/common";
import { Capability } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp } from "../../test-helpers";
import { isolatedOrg, type IsolatedOrg } from "./node-partitions.helpers";
import { PrincipalType } from "./principal";

/** Node partitions, review follow-ups: a no-op "open" patch, and managers who must stay in their partition (rule 8). */
describe("Node partitions: hardening (e2e)", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let org: IsolatedOrg;

  const move = (nodeId: string, newParentId: string | null) =>
    http.patch(`/api/v1/org/areas/${nodeId}/move`).set(org.admin.auth).send({ newParentId });
  const assign = (userId: string, orgNodeId: string | null) =>
    http.patch(`/api/v1/org/members/${userId}/assignment`).set(org.admin.auth).send({ orgNodeId });
  const nodeOf = async (userId: string) =>
    (await prisma.userProfile.findUniqueOrThrow({ where: { userId } })).orgNodeId;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    org = await isolatedOrg(app);
  });

  afterAll(async () => {
    await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
    await prisma.instanceSettings.update({ where: { id: 1 }, data: { nodeIsolationAllowed: false } });
    await app?.close();
  });

  describe("a space that is already open", () => {
    it("a manager who is not a crosser can save it with restricted:false (nothing changes), but cannot open a restricted one", async () => {
      const open = (
        await http
          .post("/api/v1/know/spaces")
          .set(org.admin.auth)
          .send({ name: `Open ${Date.now()}`, restricted: false })
          .expect(201)
      ).body.data.id as string;
      await http
        .post(`/api/v1/know/spaces/${open}/access`)
        .set(org.admin.auth)
        .send({ principalType: PrincipalType.USER, principalId: org.a.id, role: "MANAGER" })
        .expect(201);

      await http.patch(`/api/v1/know/spaces/${open}`).set(org.a.auth).send({ restricted: false, name: "Renamed" }).expect(200);
      expect((await prisma.space.findUniqueOrThrow({ where: { id: open } })).name).toBe("Renamed");

      await http.patch(`/api/v1/know/spaces/${open}`).set(org.a.auth).send({ restricted: true }).expect(200);
      const res = await http.patch(`/api/v1/know/spaces/${open}`).set(org.a.auth).send({ restricted: false });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ISOLATION_OPEN_SPACE");
    });
  });

  describe("managers stay in their partition when people or areas move (rule 8)", () => {
    it("moving an area under another main node is refused while its manager (who sits elsewhere in A) would be outside, and nothing changes", async () => {
      const manager = await createActor(app, "hard-area-manager", "COLLABORATOR", org.orgId);
      await prisma.userProfile.create({ data: { userId: manager.id, organizationId: org.orgId, orgNodeId: org.nodes.a } });
      await prisma.orgNode.update({ where: { id: org.nodes.areaA }, data: { managerId: manager.id } });

      const res = await move(org.nodes.areaA, org.nodes.b);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("MANAGER_OTHER_PARTITION");
      expect((await prisma.orgNode.findUniqueOrThrow({ where: { id: org.nodes.areaA } })).parentId).toBe(org.nodes.a);

      // Inside the same main node it is fine.
      const other = await prisma.orgNode.create({ data: { name: "Area A2", parentId: org.nodes.a, organizationId: org.orgId } });
      await move(org.nodes.areaA, other.id).expect(200);
      await move(org.nodes.areaA, org.nodes.a).expect(200);

      // Moving the manager to another main node is refused too.
      const person = await assign(manager.id, org.nodes.areaB);
      expect(person.status).toBe(409);
      expect(person.body.code).toBe("MANAGER_OTHER_PARTITION");
      expect(await nodeOf(manager.id)).toBe(org.nodes.a);

      // Once they stop managing, the move is allowed.
      await prisma.orgNode.update({ where: { id: org.nodes.areaA }, data: { managerId: null } });
      await assign(manager.id, org.nodes.areaB).expect(200);
    });

    it("a crosser who manages an area does not block its move", async () => {
      const node = await prisma.orgNode.create({ data: { name: "Admin area", parentId: org.nodes.b, organizationId: org.orgId } });
      await prisma.orgNode.update({ where: { id: node.id }, data: { managerId: org.admin.id } });
      await move(node.id, org.nodes.a).expect(200);
    });

    it("a mismatch that was already there does not block an unrelated move", async () => {
      const stray = await prisma.orgNode.create({ data: { name: "Stray area", parentId: org.nodes.b, organizationId: org.orgId } });
      // The person has no node, so they are outside B: a violation that exists before the move below.
      await prisma.orgNode.update({ where: { id: stray.id }, data: { managerId: org.nobody.id } });
      const someone = await createActor(app, "hard-unrelated", "COLLABORATOR", org.orgId);
      await prisma.userProfile.create({ data: { userId: someone.id, organizationId: org.orgId, orgNodeId: org.nodes.areaA } });

      await assign(someone.id, org.nodes.areaB).expect(200);
      await prisma.orgNode.update({ where: { id: stray.id }, data: { managerId: null } });
    });
  });
  describe("global positions are not a way across main nodes (rule 7)", () => {
    it("a non-crosser cannot find or grant a global position, cannot touch one a crosser granted; a crosser can grant it", async () => {
      await prisma.userCapability.create({
        data: { userId: org.a.id, organizationId: org.orgId, capability: Capability.KNOW_SPACE_CREATE, grantedById: org.admin.id },
      });
      const global = await prisma.position.create({
        data: { name: "Hard Instructor", organizationId: org.orgId, createdById: org.admin.id },
      });
      const scoped = await prisma.position.create({
        data: { name: "Hard Instructor A", organizationId: org.orgId, orgNodeId: org.nodes.a, createdById: org.admin.id },
      });
      await prisma.userProfile.update({ where: { userId: org.b.id }, data: { positionId: global.id } });

      const space = (await http.post("/api/v1/know/spaces").set(org.a.auth).send({ name: "A private" }).expect(201)).body.data.id as string;
      const grant = (who: IsolatedOrg["a"], positionId: string) =>
        http
          .post(`/api/v1/know/spaces/${space}/access`)
          .set(who.auth)
          .send({ principalType: PrincipalType.POSITION, principalId: positionId, role: "VIEWER" });

      // Picker: only the position of its own main node.
      const found = (await http.get("/api/v1/org/principals?q=Hard Instructor").set(org.a.auth).expect(200)).body;
      expect(found.map((p: { id: string }) => p.id)).toEqual([scoped.id]);

      await grant(org.a, global.id).expect(404);
      await http.get(`/api/v1/know/spaces/${space}`).set(org.b.auth).expect(404);
      await grant(org.a, scoped.id).expect(201);

      // A crosser may grant it, and a then sees the entry only as hidden.
      const entry = (await grant(org.admin, global.id).expect(201)).body.id as string;
      const list = (await http.get(`/api/v1/know/spaces/${space}/access`).set(org.a.auth).expect(200)).body;
      expect(list.entries.map((e: { principal: { id: string } }) => e.principal.id)).not.toContain(global.id);
      expect(list.hiddenCount).toBeGreaterThanOrEqual(1);
      await http.patch(`/api/v1/know/spaces/${space}/access/${entry}`).set(org.a.auth).send({ role: "MANAGER" }).expect(404);
      await http.delete(`/api/v1/know/spaces/${space}/access/${entry}`).set(org.a.auth).expect(404);
      await http.get(`/api/v1/know/spaces/${space}`).set(org.b.auth).expect(200);
    });
  });
});
