import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

const AREAS = "/api/v1/org/areas";

describe("Main nodes e2e (code, external, main)", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let member: TestActor;
  let outsider: TestActor;

  // creating areas is throttled per person (30 a minute): the admin's calls rotate over a few admins of the same org
  const admins: TestActor[] = [];
  let turn = 0;
  const create = (who: TestActor, body: Record<string, unknown>) =>
    http
      .post(AREAS)
      .set((who === admin ? admins[turn++ % admins.length] : who).auth)
      .send(body);
  const update = (who: TestActor, id: string, body: Record<string, unknown>) =>
    http.patch(`${AREAS}/${id}`).set(who.auth).send(body);
  const node = (id: string) =>
    prisma.orgNode.findUniqueOrThrow({ where: { id } });
  const audits = (entityId: string, action: string) =>
    prisma.auditLog.findMany({
      where: { entityId, action },
      orderBy: { createdAt: "asc" },
    });
  let seq = 0;
  const name = (p: string) => `${p} ${Date.now()}-${seq++}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "rn-admin", "ADMIN");
    admins.push(
      admin,
      ...(await Promise.all(
        [1, 2, 3].map((i) =>
          createActor(app, `rn-admin${i}`, "ADMIN", admin.orgId),
        ),
      )),
    );
    member = await createActor(app, "rn-member", "COLLABORATOR", admin.orgId);
    outsider = await createActor(app, "rn-out", "ADMIN");
  });

  afterAll(async () => app?.close());

  describe("code", () => {
    it("is stored trimmed and upper-cased on create and audited", async () => {
      const res = await create(admin, {
        name: name("Code create"),
        code: "  cli-01 ",
      }).expect(201);
      expect(res.body.data.code).toBe("CLI-01");
      expect((await node(res.body.data.id)).code).toBe("CLI-01");
      const [row] = await audits(res.body.data.id, "OrgNode.CREATE");
      expect(row.newValues).toMatchObject({ code: "CLI-01", external: false });
    });

    it('updates, audits, and clears with "" and with null', async () => {
      const id = (
        await create(admin, { name: name("Code update") }).expect(201)
      ).body.data.id;
      expect((await node(id)).code).toBeNull();

      await update(admin, id, { code: " ruc.2/b_9 " }).expect(200);
      expect((await node(id)).code).toBe("RUC.2/B_9");
      const [row] = await audits(id, "OrgNode.UPDATE");
      expect(row.oldValues).toMatchObject({ code: null });
      expect(row.newValues).toMatchObject({ code: "RUC.2/B_9" });

      await update(admin, id, { code: "" }).expect(200);
      expect((await node(id)).code).toBeNull();
      await update(admin, id, { code: "X1" }).expect(200);
      await update(admin, id, { code: null }).expect(200);
      expect((await node(id)).code).toBeNull();
    });

    it("many nodes without a code do not collide", async () => {
      await create(admin, { name: name("No code a") }).expect(201);
      await create(admin, { name: name("No code b") }).expect(201);
    });

    it("a duplicate answers 409 NODE_CODE_TAKEN, also when it differs only in case, on create and update", async () => {
      await create(admin, { name: name("Dup a"), code: "DUP-1" }).expect(201);
      const taken = await create(admin, {
        name: name("Dup b"),
        code: "dup-1",
      }).expect(409);
      expect(taken.body.code).toBe("NODE_CODE_TAKEN");

      const id = (
        await create(admin, { name: name("Dup c"), code: "DUP-2" }).expect(201)
      ).body.data.id;
      const res = await update(admin, id, { code: "Dup-1" }).expect(409);
      expect(res.body.code).toBe("NODE_CODE_TAKEN");
      expect((await node(id)).code).toBe("DUP-2");
    });

    it("a duplicate name with a code set is still ORG_NODE_DUPLICATE_NAME", async () => {
      const n = name("Dup name");
      await create(admin, { name: n, code: "DN-1" }).expect(201);
      expect(
        (await create(admin, { name: n, code: "DN-2" }).expect(409)).body.code,
      ).toBe("ORG_NODE_DUPLICATE_NAME");
    });

    it("rejects invalid characters and more than 40 characters with 400", async () => {
      await create(admin, { name: name("Bad a"), code: "has space" }).expect(
        400,
      );
      await create(admin, { name: name("Bad b"), code: "ñandú" }).expect(400);
      await create(admin, { name: name("Bad c"), code: "A".repeat(41) }).expect(
        400,
      );
      const id = (await create(admin, { name: name("Bad d") }).expect(201)).body
        .data.id;
      await update(admin, id, { code: "a$b" }).expect(400);
      await update(admin, id, { code: "A".repeat(41) }).expect(400);
      await update(admin, id, { code: "A".repeat(40) }).expect(200);
    });

    it("the same code in another organization is allowed", async () => {
      await create(admin, {
        name: name("Shared code"),
        code: "SHARED-1",
      }).expect(201);
      await create(outsider, {
        name: name("Shared code"),
        code: "SHARED-1",
      }).expect(201);
    });

    it("another organization cannot read or change the node", async () => {
      const id = (
        await create(admin, {
          name: name("Private"),
          code: "PRIV-1",
          external: true,
        }).expect(201)
      ).body.data.id;
      await update(outsider, id, { code: "HIJACK" }).expect(404);
      expect((await node(id)).code).toBe("PRIV-1");
      const full = (
        await http.get(`${AREAS}/full`).set(outsider.auth).expect(200)
      ).body.data.nodes as { id: string }[];
      expect(full.map((n) => n.id)).not.toContain(id);
    });

    it("a non-ADMIN cannot create or update", async () => {
      const id = (await create(admin, { name: name("Admin only") }).expect(201))
        .body.data.id;
      await create(member, { name: name("Nope"), code: "NOPE" }).expect(403);
      await update(member, id, { code: "NOPE" }).expect(403);
      expect((await node(id)).code).toBeNull();
    });
  });

  describe("admin data and archiving", () => {
    it("GET /org/areas (any member) carries no code or external; /areas/full does", async () => {
      const id = (
        await create(admin, {
          name: name("Hidden"),
          code: "HID-1",
          external: true,
        }).expect(201)
      ).body.data.id;
      const list = (await http.get(AREAS).set(member.auth).expect(200)).body
        .data as Record<string, unknown>[];
      const row = list.find((n) => n.id === id);
      expect(row).toBeDefined();
      expect(row).not.toHaveProperty("code");
      expect(row).not.toHaveProperty("external");
    });

    it("archiving frees the code, keeps the old one in the audit, and the code can be reused", async () => {
      const keep = (await create(admin, { name: name("Keep") }).expect(201))
        .body.data.id;
      const id = (
        await create(admin, { name: name("Archive me"), code: "ARC-1" }).expect(
          201,
        )
      ).body.data.id;
      await http
        .delete(`${AREAS}/${id}?reassignTo=${keep}`)
        .set(admin.auth)
        .expect(200);
      expect((await node(id)).code).toBeNull();
      const [row] = await audits(id, "OrgNode.ARCHIVE");
      expect(row.oldValues).toMatchObject({ code: "ARC-1" });
      await create(admin, { name: name("Back again"), code: "arc-1" }).expect(
        201,
      );
    });

    it("archiving a node with no code leaves code out of the audit", async () => {
      const keep = (await create(admin, { name: name("Keep 2") }).expect(201))
        .body.data.id;
      const id = (
        await create(admin, { name: name("Archive plain") }).expect(201)
      ).body.data.id;
      await http
        .delete(`${AREAS}/${id}?reassignTo=${keep}`)
        .set(admin.auth)
        .expect(200);
      const [row] = await audits(id, "OrgNode.ARCHIVE");
      expect(row.oldValues).not.toHaveProperty("code");
    });
  });

  describe("external", () => {
    it("on a main node is stored, returned by /org/areas/full and audited", async () => {
      const id = (
        await create(admin, {
          name: name("Client"),
          code: "CLIENT-1",
          external: true,
        }).expect(201)
      ).body.data.id;
      expect((await node(id)).external).toBe(true);
      const [created] = await audits(id, "OrgNode.CREATE");
      expect(created.newValues).toMatchObject({
        code: "CLIENT-1",
        external: true,
      });

      const internal = (
        await create(admin, { name: name("Own root") }).expect(201)
      ).body.data.id;
      await update(admin, internal, { external: true }).expect(200);
      const [row] = await audits(internal, "OrgNode.UPDATE");
      expect(row.oldValues).toMatchObject({ external: false });
      expect(row.newValues).toMatchObject({ external: true });

      const full = (await http.get(`${AREAS}/full`).set(admin.auth).expect(200))
        .body.data.nodes as {
        id: string;
        code: string | null;
        external: boolean;
      }[];
      expect(full.find((n) => n.id === id)).toMatchObject({
        code: "CLIENT-1",
        external: true,
      });
      expect(full.find((n) => n.id === internal)).toMatchObject({
        code: null,
        external: true,
      });
    });

    it("on a child node answers 400 NODE_NOT_MAIN (create with parentId, and update)", async () => {
      const root = (await create(admin, { name: name("Root") }).expect(201))
        .body.data.id;
      const res = await create(admin, {
        name: name("Child"),
        parentId: root,
        external: true,
      }).expect(400);
      expect(res.body.code).toBe("NODE_NOT_MAIN");

      const child = (
        await create(admin, { name: name("Child ok"), parentId: root }).expect(
          201,
        )
      ).body.data.id;
      const upd = await update(admin, child, { external: true }).expect(400);
      expect(upd.body.code).toBe("NODE_NOT_MAIN");
      expect((await node(child)).external).toBe(false);
      await update(admin, child, { external: false }).expect(200);
    });

    it("moving an external main node under another node clears it and the MOVE audit records it", async () => {
      const target = (await create(admin, { name: name("Target") }).expect(201))
        .body.data.id;
      const ext = (
        await create(admin, { name: name("Ext"), external: true }).expect(201)
      ).body.data.id;
      await http
        .patch(`${AREAS}/${ext}/move`)
        .set(admin.auth)
        .send({ newParentId: target })
        .expect(200);
      expect((await node(ext)).external).toBe(false);
      const [row] = await audits(ext, "OrgNode.MOVE");
      expect(row.oldValues).toMatchObject({ external: true });
      expect(row.newValues).toMatchObject({ external: false });
    });

    it("moving an internal node does not add external to the MOVE audit", async () => {
      const target = (
        await create(admin, { name: name("Target 2") }).expect(201)
      ).body.data.id;
      const plain = (await create(admin, { name: name("Plain") }).expect(201))
        .body.data.id;
      await http
        .patch(`${AREAS}/${plain}/move`)
        .set(admin.auth)
        .send({ newParentId: target })
        .expect(200);
      const [row] = await audits(plain, "OrgNode.MOVE");
      expect(row.oldValues).not.toHaveProperty("external");
    });
  });

  describe("main on node payloads", () => {
    let root: string;
    let child: string;

    beforeAll(async () => {
      root = (await create(admin, { name: "Main Quality" }).expect(201)).body
        .data.id;
      child = (
        await create(admin, { name: "Child Quality", parentId: root }).expect(
          201,
        )
      ).body.data.id;
    });

    it("GET /org/principals", async () => {
      const hits = (
        await http
          .get("/api/v1/org/principals?q=quality")
          .set(member.auth)
          .expect(200)
      ).body as {
        type: string;
        id: string;
        main?: boolean;
      }[];
      expect(hits.find((h) => h.id === root)).toMatchObject({
        type: "ORG_NODE",
        main: true,
      });
      expect(hits.find((h) => h.id === child)).toMatchObject({
        type: "ORG_NODE",
        main: false,
      });
    });

    it("the KNOW space access list", async () => {
      const space = await prisma.space.create({
        data: {
          name: name("Space"),
          restricted: true,
          organizationId: admin.orgId,
          createdBy: admin.id,
        },
      });
      for (const orgNodeId of [root, child]) {
        await prisma.spaceAccess.create({
          data: {
            spaceId: space.id,
            orgNodeId,
            role: "VIEWER",
            createdById: admin.id,
          },
        });
      }
      const entries = (
        await http
          .get(`/api/v1/know/spaces/${space.id}/access`)
          .set(admin.auth)
          .expect(200)
      ).body.entries as { principal: { id: string; main?: boolean } }[];
      expect(entries.find((e) => e.principal.id === root)?.principal.main).toBe(
        true,
      );
      expect(
        entries.find((e) => e.principal.id === child)?.principal.main,
      ).toBe(false);
    });

    it("the GROW course assignments list and the reports filter options", async () => {
      const grow = (p: string) => `/api/v1/grow${p}`;
      const course = (
        await http
          .post(grow("/courses"))
          .set(admin.auth)
          .send({ title: "Main flag" })
          .expect(201)
      ).body.id as string;
      for (const orgNodeId of [root, child]) {
        await prisma.courseAssignment.create({
          data: {
            courseId: course,
            orgNodeId,
            createdById: admin.id,
            organizationId: admin.orgId,
          },
        });
      }
      const list = (
        await http
          .get(grow(`/courses/${course}/assignments`))
          .set(admin.auth)
          .expect(200)
      ).body as {
        principal: { id: string; main?: boolean };
      }[];
      expect(list.find((e) => e.principal.id === root)?.principal.main).toBe(
        true,
      );
      expect(list.find((e) => e.principal.id === child)?.principal.main).toBe(
        false,
      );

      const report = (
        await http.get(grow("/reports/compliance")).set(admin.auth).expect(200)
      ).body as {
        filters: { areas: { id: string; main?: boolean }[] };
      };
      expect(report.filters.areas.find((a) => a.id === root)?.main).toBe(true);
      expect(report.filters.areas.find((a) => a.id === child)?.main).toBe(
        false,
      );
    });
  });
});
