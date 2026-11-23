import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

describe("Instance theme e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let superadmin: TestActor;
  let admin: TestActor;

  const patch = (theme: object, actor: TestActor = superadmin) =>
    http.patch("/api/v1/instance/settings").set(actor.auth).send({ theme });
  const reset = {
    brandPrimary: null,
    brandSecondary: null,
    fontKey: null,
    radiusKey: null,
    glassKey: null,
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    superadmin = await createActor(app, "theme-super", "ADMIN");
    await prisma.user.update({
      where: { id: superadmin.id },
      data: { isSuperAdmin: true },
    });
    admin = await createActor(app, "theme-admin", "ADMIN");
  });

  afterAll(async () => {
    await prisma.instanceSettings.update({ where: { id: 1 }, data: reset });
    await app.close();
  });

  it("stores the theme and serves the seeds publicly, with no organization data", async () => {
    await patch({
      brandPrimary: "4C33E1",
      brandSecondary: "#112233",
      fontKey: "geist",
      radiusKey: "round",
    }).expect(200);
    const res = await http.get("/api/v1/instance/public").expect(200);
    expect(res.body.theme).toEqual({
      brandPrimary: "#4c33e1",
      brandSecondary: "#112233",
      fontKey: "geist",
      radiusKey: "round",
      glassKey: null,
    });
    expect(res.body).not.toHaveProperty("orgThemingAllowed");
    expect(res.body).not.toHaveProperty("organizations");
  });

  it("an ADMIN who is not superadmin gets 403 and anonymous gets 401", async () => {
    await patch({ brandPrimary: "#000000" }, admin).expect(403);
    await http
      .patch("/api/v1/instance/settings")
      .send({ theme: { brandPrimary: "#000000" } })
      .expect(401);
  });

  it("answers 400 INVALID_COLOR for a bad hex and for a secondary with no primary", async () => {
    await patch(reset).expect(200);
    const bad = await patch({ brandPrimary: "red" }).expect(400);
    expect(bad.body.code).toBe("INVALID_COLOR");
    const orphan = await patch({ brandSecondary: "#112233" }).expect(400);
    expect(orphan.body.code).toBe("INVALID_COLOR");
  });

  it("rejects an unknown font or radius", async () => {
    await patch({ fontKey: "x" }).expect(400);
    await patch({ radiusKey: "x" }).expect(400);
  });

  it("a theme of nulls resets, and the change is audited with no organization", async () => {
    await patch({ brandPrimary: "#4c33e1", fontKey: "dm-sans" }).expect(200);
    const before = await prisma.auditLog.count({
      where: {
        action: "InstanceSettings.UPDATE_THEME",
        actorId: superadmin.id,
      },
    });
    await patch(reset).expect(200);
    const res = await http.get("/api/v1/instance/public").expect(200);
    expect(res.body.theme).toEqual(reset);

    const rows = await prisma.auditLog.findMany({
      where: {
        action: "InstanceSettings.UPDATE_THEME",
        actorId: superadmin.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(rows.length).toBe(before + 1);
    expect(rows[0].organizationId).toBeNull();
    expect(rows[0].entityType).toBe("InstanceSettings");
    expect(rows[0].oldValues).toEqual({
      brandPrimary: "#4c33e1",
      fontKey: "dm-sans",
    });
    expect(rows[0].newValues).toEqual({ brandPrimary: null, fontKey: null });
  });

  it("resetting only the primary clears the stored secondary and audits it", async () => {
    await patch({ brandPrimary: "#4c33e1", brandSecondary: "#112233" }).expect(
      200,
    );
    await patch({ brandPrimary: null }).expect(200);
    const row = await prisma.instanceSettings.findUniqueOrThrow({
      where: { id: 1 },
    });
    expect(row.brandPrimary).toBeNull();
    expect(row.brandSecondary).toBeNull();
    const res = await http.get("/api/v1/instance/public").expect(200);
    expect(res.body.theme.brandPrimary).toBeNull();
    expect(res.body.theme.brandSecondary).toBeNull();
    const last = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "InstanceSettings.UPDATE_THEME",
        actorId: superadmin.id,
      },
      orderBy: { createdAt: "desc" },
    });
    expect(last.oldValues).toEqual({
      brandPrimary: "#4c33e1",
      brandSecondary: "#112233",
    });
    expect(last.newValues).toEqual({
      brandPrimary: null,
      brandSecondary: null,
    });
  });

  it("rejects a colour that is not a string", async () => {
    await patch({ brandPrimary: 123 }).expect(400);
  });

  it("other settings still update without a theme and write no theme audit", async () => {
    const before = await prisma.auditLog.count({
      where: { action: "InstanceSettings.UPDATE_THEME" },
    });
    await http
      .patch("/api/v1/instance/settings")
      .set(superadmin.auth)
      .send({ registrationOpen: true })
      .expect(200);
    expect(
      await prisma.auditLog.count({
        where: { action: "InstanceSettings.UPDATE_THEME" },
      }),
    ).toBe(before);
  });
});
