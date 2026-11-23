import { INestApplication } from "@nestjs/common";
import { Capability } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { isolatedOrg, type IsolatedOrg } from "./node-partitions.helpers";
import { PrincipalType } from "./principal";

/** Node partitions, rules 5 and 7 (task T5): restricted defaults, who may open spaces, and grants by partition. */
describe("Node partitions: spaces, courses and grants (e2e)", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let org: IsolatedOrg;
  let foreign: TestActor;
  let sharedSpace: string;
  let entryOfB: string;
  let entryOfNodeB: string;

  const call = (who: TestActor, method: "get" | "post" | "patch" | "delete", path: string, body?: object) => {
    const req = http[method](`/api/v1${path}`).set(who.auth);
    return body ? req.send(body) : req;
  };
  const access = (who: TestActor, spaceId = sharedSpace) => call(who, "get", `/know/spaces/${spaceId}/access`);
  const restrictedOf = async (spaceId: string) =>
    (await prisma.space.findUniqueOrThrow({ where: { id: spaceId }, select: { restricted: true } })).restricted;
  const newSpace = async (who: TestActor, body: object) =>
    (await call(who, "post", "/know/spaces", { name: `Space ${Date.now()}-${Math.random()}`, ...body }).expect(201))
      .body.data.id as string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    org = await isolatedOrg(app);
    foreign = await createActor(app, "zz-foreign-content", "ADMIN");
    await prisma.userCapability.create({
      data: { userId: org.a.id, organizationId: org.orgId, capability: Capability.KNOW_SPACE_CREATE, grantedById: org.admin.id },
    });

    // A restricted space the admin shares: a manages it through a row of their own, B and its node are granted too.
    sharedSpace = await newSpace(org.admin, { restricted: true });
    await call(org.admin, "post", `/know/spaces/${sharedSpace}/access`, {
      principalType: PrincipalType.USER,
      principalId: org.a.id,
      role: "MANAGER",
    }).expect(201);
    entryOfB = (
      await call(org.admin, "post", `/know/spaces/${sharedSpace}/access`, {
        principalType: PrincipalType.USER,
        principalId: org.b.id,
        role: "VIEWER",
      }).expect(201)
    ).body.id;
    entryOfNodeB = (
      await call(org.admin, "post", `/know/spaces/${sharedSpace}/access`, {
        principalType: PrincipalType.ORG_NODE,
        principalId: org.nodes.b,
        role: "VIEWER",
      }).expect(201)
    ).body.id;
    await call(org.admin, "post", `/know/spaces/${sharedSpace}/access`, {
      principalType: PrincipalType.ORG_NODE,
      principalId: org.nodes.areaA,
      role: "VIEWER",
    }).expect(201);
  });

  afterAll(async () => {
    // The instance switch is global to the test database: leave it off, as the suites expect.
    await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
    await prisma.instanceSettings.update({ where: { id: 1 }, data: { nodeIsolationAllowed: false } });
    await app?.close();
  });

  describe("granting a space (rule 7)", () => {
    it("a manager of a partition cannot grant the space to a person or an area outside it (404)", async () => {
      await call(org.a, "post", `/know/spaces/${sharedSpace}/access`, {
        principalType: PrincipalType.USER,
        principalId: org.b.id,
        role: "EDITOR",
      }).expect(404);
      await call(org.a, "post", `/know/spaces/${sharedSpace}/access`, {
        principalType: PrincipalType.ORG_NODE,
        principalId: org.nodes.b,
        role: "EDITOR",
      }).expect(404);
      // The existing row of B did not change.
      expect((await prisma.spaceAccess.findUniqueOrThrow({ where: { id: entryOfB } })).role).toBe("VIEWER");
    });

    it("a cannot change or remove an entry that belongs to another partition (404, nothing changes)", async () => {
      await call(org.a, "patch", `/know/spaces/${sharedSpace}/access/${entryOfB}`, { role: "EDITOR" }).expect(404);
      await call(org.a, "patch", `/know/spaces/${sharedSpace}/access/${entryOfNodeB}`, { role: "EDITOR" }).expect(404);
      await call(org.a, "delete", `/know/spaces/${sharedSpace}/access/${entryOfB}`).expect(404);
      await call(org.a, "delete", `/know/spaces/${sharedSpace}/access/${entryOfNodeB}`).expect(404);
      expect((await prisma.spaceAccess.findUniqueOrThrow({ where: { id: entryOfB } })).role).toBe("VIEWER");
      expect(await prisma.spaceAccess.count({ where: { id: entryOfNodeB } })).toBe(1);
    });

    it("a grants inside its partition, and sees only its own entries with hiddenCount for the rest", async () => {
      await call(org.a, "post", `/know/spaces/${sharedSpace}/access`, {
        principalType: PrincipalType.ORG_NODE,
        principalId: org.nodes.areaA,
        role: "EDITOR",
      }).expect(201);
      const { body } = await access(org.a).expect(200);
      const shown = body.entries.map((e: { principal: { id: string } }) => e.principal.id).sort();
      // Visible: a (MANAGER) and area A. Hidden: the admin who created the space, b, and node B.
      expect(shown).toEqual([org.a.id, org.nodes.areaA].sort());
      expect(body.hiddenCount).toBe(3);
      const bEmail = (await prisma.user.findUniqueOrThrow({ where: { id: org.b.id }, select: { email: true } })).email;
      expect(JSON.stringify(body)).not.toContain(org.b.id);
      expect(JSON.stringify(body)).not.toContain(bEmail);
    });

    it("a crosser sees every entry and hiddenCount 0", async () => {
      const { body } = await access(org.admin).expect(200);
      expect(body.entries).toHaveLength(5);
      expect(body.hiddenCount).toBe(0);
    });
  });

  describe("spaces open to everyone (rule 5)", () => {
    it("a new space is restricted by default while isolated, and the column says so", async () => {
      const id = await newSpace(org.a, {});
      expect(await restrictedOf(id)).toBe(true);
      const admin = await newSpace(org.admin, {});
      expect(await restrictedOf(admin)).toBe(true);
    });

    it("a cannot create an unrestricted space (403 ISOLATION_OPEN_SPACE); restricted:true works", async () => {
      const res = await call(org.a, "post", "/know/spaces", { name: "Open", restricted: false });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ISOLATION_OPEN_SPACE");
      await call(org.a, "post", "/know/spaces", { name: "Explicit", restricted: true }).expect(201);
    });

    it("a cannot make its space unrestricted on update (403); a crosser can", async () => {
      const res = await call(org.a, "patch", `/know/spaces/${sharedSpace}`, { restricted: false });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("ISOLATION_OPEN_SPACE");
      expect(await restrictedOf(sharedSpace)).toBe(true);

      await call(org.admin, "patch", `/know/spaces/${sharedSpace}`, { restricted: false }).expect(200);
      expect(await restrictedOf(sharedSpace)).toBe(false);
      await call(org.admin, "patch", `/know/spaces/${sharedSpace}`, { restricted: true }).expect(200);
    });

    it("a crosser creates an unrestricted space that a person without a node reads, and sees nobody in principals", async () => {
      const open = await newSpace(org.admin, { restricted: false });
      expect(await restrictedOf(open)).toBe(false);

      await call(org.nobody, "get", `/know/spaces/${open}`).expect(200);
      const list = (await call(org.nobody, "get", "/know/spaces").expect(200)).body.data.map((s: { id: string }) => s.id);
      expect(list).toContain(open);
      expect((await call(org.nobody, "get", "/org/principals?q=iso").expect(200)).body).toEqual([]);
      expect((await call(org.nobody, "get", "/org/areas").expect(200)).body.data).toEqual([]);
    });

    it("a course is restricted by default while isolated; an unrestricted course reads for a person without a node", async () => {
      const restricted = (await call(org.admin, "post", "/grow/courses", { title: "Default" }).expect(201)).body.id;
      const row = await prisma.course.findUniqueOrThrow({ where: { id: restricted }, select: { restricted: true } });
      expect(row.restricted).toBe(true);

      const open = (
        await call(org.admin, "post", "/grow/courses", { title: "Open course", restricted: false }).expect(201)
      ).body.id;
      await prisma.course.update({ where: { id: open }, data: { status: "PUBLISHED", publishedAt: new Date() } });
      await call(org.nobody, "get", `/grow/courses/${open}`).expect(200);
    });
  });

  describe("isolation off (rule 10)", () => {
    it("a can make an unrestricted space and grant it to b", async () => {
      await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
      try {
        const open = await newSpace(org.a, { restricted: false });
        expect(await restrictedOf(open)).toBe(false);
        await call(org.a, "post", `/know/spaces/${open}/access`, {
          principalType: PrincipalType.USER,
          principalId: org.b.id,
          role: "VIEWER",
        }).expect(201);
        const { body } = await access(org.a, open).expect(200);
        expect(body.hiddenCount).toBe(0);
      } finally {
        await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: true } });
      }
    });
  });

  describe("routes that do not change for a (isolation on and off)", () => {
    /** Responses without the volatile fields (timestamps) and without the switch that isolation adds to /auth/me. */
    const snapshot = async () => {
      const strip = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(strip);
        if (value && typeof value === "object")
          return Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => !/At$/.test(key) && key !== "isolated")
              .map(([key, v]) => [key, strip(v)]),
          );
        return value;
      };
      const get = async (path: string) => strip((await call(org.a, "get", path).expect(200)).body);
      return {
        spaces: await get("/know/spaces"),
        space: await get(`/know/spaces/${sharedSpace}`),
        learning: await get("/grow/learning"),
        me: await get("/auth/me"),
      };
    };

    it("answers the same for a with the organization switch on and off", async () => {
      const on = await snapshot();
      await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: false } });
      let off: Awaited<ReturnType<typeof snapshot>>;
      try {
        off = await snapshot();
      } finally {
        await prisma.organization.update({ where: { id: org.orgId }, data: { isolateRootNodes: true } });
      }
      expect(off).toEqual(on);
    });
  });

  describe("another organization (isolation)", () => {
    it("its ADMIN gets 404 on the access routes of this space", async () => {
      await access(foreign).expect(404);
      await call(foreign, "post", `/know/spaces/${sharedSpace}/access`, {
        principalType: PrincipalType.USER,
        principalId: org.b.id,
        role: "VIEWER",
      }).expect(404);
    });
  });
});
