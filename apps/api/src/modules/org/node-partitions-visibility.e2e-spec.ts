import { INestApplication } from "@nestjs/common";
import { Capability } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { isolatedOrg, type IsolatedOrg } from "./node-partitions.helpers";
import { PrincipalType } from "./principal";

/** Node partitions, rules 2 and 3: people, areas and positions a non-crosser may see (task T3). */
describe("Node partitions: visibility of people, areas and positions (e2e)", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let org: IsolatedOrg;
  let sharedRole: string;
  let roleA: string;
  let roleB: string;
  let foreign: TestActor;

  type Hit = { type: string; id: string; name: string };
  type Area = { id: string; name: string; manager: unknown; _count: { profiles: number } };
  type Position = { id: string; name: string; _count: { profiles: number } };

  const principals = async (who: TestActor, q: string) =>
    (await http.get(`/api/v1/org/principals?q=${encodeURIComponent(q)}`).set(who.auth).expect(200)).body as Hit[];
  const areas = async (who: TestActor) =>
    (await http.get("/api/v1/org/areas").set(who.auth).expect(200)).body.data as Area[];
  const positions = async (who: TestActor) =>
    (await http.get("/api/v1/org/positions").set(who.auth).expect(200)).body.data as Position[];
  const ids = (hits: { type: string; id: string }[], type: PrincipalType) =>
    hits
      .filter((h) => h.type === type)
      .map((h) => h.id)
      .sort();
  const sorted = (xs: string[]) => [...xs].sort();

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    org = await isolatedOrg(app);

    const position = (name: string, orgNodeId: string | null) =>
      prisma.position.create({
        data: { name, organizationId: org.orgId, orgNodeId, createdById: org.admin.id },
      });
    sharedRole = (await position("Shared role", null)).id;
    roleA = (await position("Role A", org.nodes.a)).id;
    roleB = (await position("Role B", org.nodes.b)).id;
    // Everyone of A and B holds the shared position: its count must differ by who asks.
    await prisma.userProfile.update({ where: { userId: org.a.id }, data: { positionId: sharedRole } });
    await prisma.userProfile.update({ where: { userId: org.b.id }, data: { positionId: sharedRole } });

    foreign = await createActor(app, "zz-foreign", "ADMIN");
    await prisma.orgNode.create({ data: { name: "Foreign client", organizationId: foreign.orgId } });
    await prisma.position.create({
      data: { name: "Foreign role", organizationId: foreign.orgId, createdById: foreign.id },
    });
  });

  afterAll(async () => {
    // The instance switch is global to the test database: leave it off, as the suites expect, once this org is off.
    await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
    await prisma.instanceSettings.update({ where: { id: 1 }, data: { nodeIsolationAllowed: false } });
    await app?.close();
  });

  describe("with isolation on", () => {
    it("a sees only their own people, main node and areas, and the shared and own positions", async () => {
      expect(ids(await principals(org.a, "iso"), PrincipalType.USER)).toEqual([org.a.id]);
      expect(ids(await principals(org.a, "Client"), PrincipalType.ORG_NODE)).toEqual([org.nodes.a]);
      expect(ids(await principals(org.a, "Area"), PrincipalType.ORG_NODE)).toEqual([org.nodes.areaA]);
      expect(ids(await principals(org.a, "role"), PrincipalType.POSITION)).toEqual([roleA]); // a global position reaches every main node: not offered for granting

      expect((await areas(org.a)).map((n) => n.id).sort()).toEqual(sorted([org.nodes.a, org.nodes.areaA]));
      const positionsOfA = await positions(org.a);
      expect(positionsOfA.map((p) => p.id).sort()).toEqual(sorted([sharedRole, roleA]));
      // Only a holds the shared position inside a's partition.
      expect(positionsOfA.find((p) => p.id === sharedRole)?._count.profiles).toBe(1);
    });

    it.each(["ADMIN", "MANAGER", "GROW_COURSE_MANAGE holder"])("a crosser (%s) sees both partitions", async (kind) => {
      const who = kind === "ADMIN" ? org.admin : kind === "MANAGER" ? org.moderator : org.courseManager;
      const people = ids(await principals(who, "iso"), PrincipalType.USER);
      expect(people).toEqual(
        sorted([org.admin.id, org.moderator.id, org.courseManager.id, org.a.id, org.b.id, org.nobody.id]),
      );
      expect(ids(await principals(who, "Client"), PrincipalType.ORG_NODE)).toEqual(sorted([org.nodes.a, org.nodes.b]));
      expect(ids(await principals(who, "role"), PrincipalType.POSITION)).toEqual(
        sorted([sharedRole, roleA, roleB]),
      );
      expect((await areas(who)).map((n) => n.id).sort()).toEqual(
        sorted([org.nodes.a, org.nodes.areaA, org.nodes.b, org.nodes.areaB]),
      );
      const shared = (await positions(who)).find((p) => p.id === sharedRole);
      expect(shared?._count.profiles).toBe(2);
    });

    it("a person with no node sees no people or areas, and only the shared position, with no count", async () => {
      expect(ids(await principals(org.nobody, "iso"), PrincipalType.USER)).toEqual([]);
      expect(ids(await principals(org.nobody, "Client"), PrincipalType.ORG_NODE)).toEqual([]);
      expect(ids(await principals(org.nobody, "role"), PrincipalType.POSITION)).toEqual([]);
      expect(await areas(org.nobody)).toEqual([]);
      const shared = (await positions(org.nobody)).map((p) => [p.id, p._count.profiles]);
      expect(shared).toEqual([[sharedRole, 0]]);
    });

    it("another organization's people, areas and positions never appear", async () => {
      expect(await principals(org.admin, "zz-foreign")).toEqual([]);
      expect(await principals(org.admin, "Foreign")).toEqual([]);
      expect(await principals(org.a, "Foreign")).toEqual([]);
      expect((await areas(org.admin)).map((n) => n.name)).not.toContain("Foreign client");
      expect((await positions(org.admin)).map((p) => p.name)).not.toContain("Foreign role");
    });

    it("revoking GROW_COURSE_MANAGE confines the course manager to their partition on the next request", async () => {
      // The course manager joins main node A: as a crosser they see everything, as a plain member only A.
      await prisma.userProfile.create({
        data: { userId: org.courseManager.id, organizationId: org.orgId, orgNodeId: org.nodes.a },
      });
      expect(ids(await principals(org.courseManager, "iso"), PrincipalType.USER)).toContain(org.b.id);

      await prisma.userCapability.deleteMany({
        where: { userId: org.courseManager.id, capability: Capability.GROW_COURSE_MANAGE },
      });
      expect(ids(await principals(org.courseManager, "iso"), PrincipalType.USER)).toEqual(
        sorted([org.a.id, org.courseManager.id]),
      );
      expect((await areas(org.courseManager)).map((n) => n.id).sort()).toEqual(sorted([org.nodes.a, org.nodes.areaA]));
    });
  });

  describe("with isolation off", () => {
    /** a sees both partitions: the people, the main node B and its position. */
    const seesBothPartitions = async () => {
      expect(ids(await principals(org.a, "iso"), PrincipalType.USER)).toContain(org.b.id);
      expect(ids(await principals(org.a, "Client"), PrincipalType.ORG_NODE)).toEqual(
        sorted([org.nodes.a, org.nodes.b]),
      );
      expect(ids(await principals(org.a, "role"), PrincipalType.POSITION)).toEqual(
        sorted([sharedRole, roleA, roleB]),
      );
      expect((await areas(org.a)).map((n) => n.id)).toContain(org.nodes.b);
    };

    it("with the organization switch off, a sees both partitions", async () => {
      await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
      try {
        await seesBothPartitions();
      } finally {
        await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: true } });
      }
    });

    it("with the instance switch off, a sees both partitions", async () => {
      await prisma.instanceSettings.update({ where: { id: 1 }, data: { nodeIsolationAllowed: false } });
      try {
        await seesBothPartitions();
      } finally {
        await prisma.instanceSettings.update({ where: { id: 1 }, data: { nodeIsolationAllowed: true } });
      }
    });
  });
});
