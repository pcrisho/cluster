import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

describe("Organization theme e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;

  const patch = (actor: TestActor, body: object) =>
    http.patch("/api/v1/org/theme").set(actor.auth).send(body);
  const me = async (actor: TestActor) =>
    (await http.get("/api/v1/auth/me").set(actor.auth).expect(200)).body.user;
  const row = (orgId: string) =>
    prisma.organization.findUniqueOrThrow({
      where: { id: orgId },
      select: {
        brandPrimary: true,
        brandSecondary: true,
        fontKey: true,
        radiusKey: true,
        themingEnabled: true,
      },
    });
  const master = (orgThemingAllowed: boolean) =>
    prisma.instanceSettings.update({
      where: { id: 1 },
      data: { orgThemingAllowed },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await master(false);
    await app.close();
  });

  beforeEach(() => master(true));

  describe("who may save", () => {
    it("an ADMIN with both switches on saves the theme", async () => {
      const admin = await createActor(app, "th-admin", "ADMIN");
      const res = await patch(admin, {
        brandPrimary: "#0A6CFF",
        fontKey: "geist",
      }).expect(200);
      expect(res.body).toEqual({
        brandPrimary: "#0a6cff",
        brandSecondary: null,
        fontKey: "geist",
        radiusKey: null,
      });
      expect(await row(admin.orgId)).toMatchObject({
        brandPrimary: "#0a6cff",
        fontKey: "geist",
      });
    });

    it("answers 403 ORG_THEMING_DISABLED when the master switch is off", async () => {
      const admin = await createActor(app, "th-master-off", "ADMIN");
      await master(false);
      const res = await patch(admin, { brandPrimary: "#0a6cff" }).expect(403);
      expect(res.body.code).toBe("ORG_THEMING_DISABLED");
      expect((await row(admin.orgId)).brandPrimary).toBeNull();
    });

    it("answers 403 ORG_THEMING_DISABLED when the organization switch is off", async () => {
      const admin = await createActor(app, "th-org-off", "ADMIN");
      await prisma.organization.update({
        where: { id: admin.orgId },
        data: { themingEnabled: false },
      });
      const res = await patch(admin, { brandPrimary: "#0a6cff" }).expect(403);
      expect(res.body.code).toBe("ORG_THEMING_DISABLED");
      expect((await row(admin.orgId)).brandPrimary).toBeNull();
    });

    it("a MANAGER and a COLLABORATOR get 403 and anonymous gets 401", async () => {
      const admin = await createActor(app, "th-roles", "ADMIN");
      const manager = await createActor(app, "th-mgr", "MANAGER", admin.orgId);
      const collaborator = await createActor(
        app,
        "th-col",
        "COLLABORATOR",
        admin.orgId,
      );
      await patch(manager, { brandPrimary: "#0a6cff" }).expect(403);
      await patch(collaborator, { brandPrimary: "#0a6cff" }).expect(403);
      await http
        .patch("/api/v1/org/theme")
        .send({ brandPrimary: "#0a6cff" })
        .expect(401);
      expect((await row(admin.orgId)).brandPrimary).toBeNull();
    });
  });

  it("organizations are isolated: A's theme never reaches B", async () => {
    const adminA = await createActor(app, "th-iso-a", "ADMIN");
    const adminB = await createActor(app, "th-iso-b", "ADMIN");
    await patch(adminA, { brandPrimary: "#0a6cff", radiusKey: "round" }).expect(
      200,
    );
    expect((await me(adminB)).organization.theme).toBeNull();
    expect(await row(adminB.orgId)).toMatchObject({
      brandPrimary: null,
      radiusKey: null,
    });

    await patch(adminB, { brandPrimary: "#aa2200" }).expect(200);
    expect(await row(adminA.orgId)).toMatchObject({
      brandPrimary: "#0a6cff",
      radiusKey: "round",
    });
    expect((await me(adminA)).organization.theme.brandPrimary).toBe("#0a6cff");
  });

  describe("validation", () => {
    it("a secondary with no primary is 400 INVALID_COLOR", async () => {
      const admin = await createActor(app, "th-orphan", "ADMIN");
      const res = await patch(admin, { brandSecondary: "#112233" }).expect(400);
      expect(res.body.code).toBe("INVALID_COLOR");
      expect((await row(admin.orgId)).brandSecondary).toBeNull();
    });

    it("an invalid hex is 400 INVALID_COLOR and an unknown font is 400", async () => {
      const admin = await createActor(app, "th-bad", "ADMIN");
      const res = await patch(admin, { brandPrimary: "red" }).expect(400);
      expect(res.body.code).toBe("INVALID_COLOR");
      await patch(admin, { fontKey: "comic-sans" }).expect(400);
    });

    it("clearing the primary clears the stored secondary too", async () => {
      const admin = await createActor(app, "th-clear", "ADMIN");
      await patch(admin, {
        brandPrimary: "#0a6cff",
        brandSecondary: "#112233",
      }).expect(200);
      const res = await patch(admin, { brandPrimary: null }).expect(200);
      expect(res.body.brandSecondary).toBeNull();
      expect(await row(admin.orgId)).toMatchObject({
        brandPrimary: null,
        brandSecondary: null,
      });
    });
  });

  it("a switch hides the saved theme without clearing it", async () => {
    const admin = await createActor(app, "th-hide", "ADMIN");
    await patch(admin, { brandPrimary: "#0a6cff" }).expect(200);
    expect((await me(admin)).organization).toMatchObject({
      themingAllowed: true,
      theme: { brandPrimary: "#0a6cff" },
    });

    await master(false);
    expect((await me(admin)).organization).toMatchObject({
      themingAllowed: false,
      theme: null,
    });
    await master(true);
    await prisma.organization.update({
      where: { id: admin.orgId },
      data: { themingEnabled: false },
    });
    expect((await me(admin)).organization).toMatchObject({
      themingAllowed: false,
      theme: null,
    });
    expect((await row(admin.orgId)).brandPrimary).toBe("#0a6cff");

    await prisma.organization.update({
      where: { id: admin.orgId },
      data: { themingEnabled: true },
    });
    expect((await me(admin)).organization.theme.brandPrimary).toBe("#0a6cff");
  });

  it("the switches cannot be set through this route", async () => {
    const admin = await createActor(app, "th-switch", "ADMIN");
    await patch(admin, {
      brandPrimary: "#0a6cff",
      themingEnabled: false,
      orgThemingAllowed: false,
    }).expect(200);
    expect((await row(admin.orgId)).themingEnabled).toBe(true);
    expect(
      (await prisma.instanceSettings.findUniqueOrThrow({ where: { id: 1 } }))
        .orgThemingAllowed,
    ).toBe(true);
    expect((await row(admin.orgId)).brandPrimary).toBe("#0a6cff");
  });

  it("audits Organization.UPDATE with old and new values, and nothing when unchanged", async () => {
    const admin = await createActor(app, "th-audit", "ADMIN");
    const where = {
      organizationId: admin.orgId,
      action: "Organization.UPDATE",
    };
    await patch(admin, { brandPrimary: "#0a6cff" }).expect(200);
    await patch(admin, { brandPrimary: "#0a6cff" }).expect(200);
    const rows = await prisma.auditLog.findMany({ where });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: admin.id,
      entityType: "Organization",
      entityId: admin.orgId,
      oldValues: { brandPrimary: null },
      newValues: { brandPrimary: "#0a6cff" },
    });
  });

  it("/auth/me carries theme and themingAllowed and not the raw columns", async () => {
    const admin = await createActor(app, "th-shape", "ADMIN");
    const org = (await me(admin)).organization;
    expect(org).toMatchObject({ theme: null, themingAllowed: true });
    for (const key of [
      "brandPrimary",
      "brandSecondary",
      "fontKey",
      "radiusKey",
      "themingEnabled",
      "enabledModules",
    ]) {
      expect(org).not.toHaveProperty(key);
    }
  });
});
