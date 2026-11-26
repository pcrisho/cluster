import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

describe("Instance glass e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let superadmin: TestActor;
  let admin: TestActor;

  const patch = (theme: object, actor: TestActor = superadmin) =>
    http.patch("/api/v1/instance/settings").set(actor.auth).send({ theme });
  const stored = async () =>
    (await prisma.instanceSettings.findUniqueOrThrow({ where: { id: 1 } }))
      .glassKey;
  const themeRows = () =>
    prisma.auditLog.count({
      where: {
        action: "InstanceSettings.UPDATE_THEME",
        actorId: superadmin.id,
      },
    });
  const publicGlass = async () =>
    (await http.get("/api/v1/instance/public").expect(200)).body.theme.glassKey;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    superadmin = await createActor(app, "glass-super", "ADMIN");
    await prisma.user.update({
      where: { id: superadmin.id },
      data: { isSuperAdmin: true },
    });
    admin = await createActor(app, "glass-admin", "ADMIN");
  });

  afterAll(async () => {
    await prisma.instanceSettings.update({
      where: { id: 1 },
      data: { glassKey: null, orgThemingAllowed: false },
    });
    await app.close();
  });

  it("is Off by default and public reads say so", async () => {
    expect(await stored()).toBeNull();
    expect(await publicGlass()).toBeNull();
  });

  it.each(["subtle", "medium", "strong"])(
    "the superadmin sets %s, stored and served publicly",
    async (key) => {
      await patch({ glassKey: key }).expect(200);
      expect(await stored()).toBe(key);
      expect(await publicGlass()).toBe(key);
    },
  );

  it("an ADMIN who is not superadmin gets 403 and anonymous gets 401", async () => {
    await patch({ glassKey: "strong" }, admin).expect(403);
    await http
      .patch("/api/v1/instance/settings")
      .send({ theme: { glassKey: "strong" } })
      .expect(401);
  });

  it("rejects an unknown level and a value that is not a string", async () => {
    await patch({ glassKey: "medium" }).expect(200);
    await patch({ glassKey: "neon" }).expect(400);
    await patch({ glassKey: "Strong" }).expect(400);
    await patch({ glassKey: 3 }).expect(400);
    expect(await stored()).toBe("medium");
  });

  it("null turns it Off and the change is audited with no organization", async () => {
    await patch({ glassKey: "strong" }).expect(200);
    const before = await themeRows();
    await patch({ glassKey: null }).expect(200);
    expect(await stored()).toBeNull();
    expect(await publicGlass()).toBeNull();

    const rows = await prisma.auditLog.findMany({
      where: {
        action: "InstanceSettings.UPDATE_THEME",
        actorId: superadmin.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(rows.length).toBe(before + 1);
    expect(rows[0].organizationId).toBeNull();
    expect(rows[0].oldValues).toEqual({ glassKey: "strong" });
    expect(rows[0].newValues).toEqual({ glassKey: null });
  });

  it("setting the same level again writes no audit row", async () => {
    await patch({ glassKey: "subtle" }).expect(200);
    const before = await themeRows();
    await patch({ glassKey: "subtle" }).expect(200);
    expect(await themeRows()).toBe(before);
  });

  it("changing the brand colours leaves the glass level alone", async () => {
    await patch({ glassKey: "medium" }).expect(200);
    await patch({ brandPrimary: "#4c33e1" }).expect(200);
    expect(await stored()).toBe("medium");
    await patch({ brandPrimary: null }).expect(200);
    expect(await stored()).toBe("medium");
  });

  it("an organization cannot set it, and its theme and /auth/me carry no glass", async () => {
    await patch({ glassKey: "subtle" }).expect(200);
    await prisma.instanceSettings.update({
      where: { id: 1 },
      data: { orgThemingAllowed: true },
    });
    const res = await http
      .patch("/api/v1/org/theme")
      .set(admin.auth)
      .send({ brandPrimary: "#0a6cff", glassKey: "strong" })
      .expect(200);
    expect(res.body).not.toHaveProperty("glassKey");
    expect(await stored()).toBe("subtle");

    const me = await http.get("/api/v1/auth/me").set(admin.auth).expect(200);
    expect(me.body.user.organization.theme).not.toHaveProperty("glassKey");
    expect(me.body.user.organization.theme.brandPrimary).toBe("#0a6cff");
  });

  it("other settings still update and leave the glass level alone", async () => {
    await patch({ glassKey: "strong" }).expect(200);
    await http
      .patch("/api/v1/instance/settings")
      .set(superadmin.auth)
      .send({ registrationOpen: true })
      .expect(200);
    expect(await stored()).toBe("strong");
  });
});
