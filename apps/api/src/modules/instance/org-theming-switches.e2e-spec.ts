import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

describe("Organization theming switches e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let superadmin: TestActor;
  let admin: TestActor;

  const patchSettings = (body: object, actor: TestActor = superadmin) =>
    http.patch("/api/v1/instance/settings").set(actor.auth).send(body);
  const patchOrg = (id: string, body: object, actor: TestActor = superadmin) =>
    http
      .patch(`/api/v1/instance/organizations/${id}`)
      .set(actor.auth)
      .send(body);
  /** Newest first: without an order Postgres may return them in any order. */
  const rows = (action: string, entityId: string) =>
    prisma.auditLog.findMany({
      where: { action, entityId },
      orderBy: { createdAt: "desc" },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    superadmin = await createActor(app, "switch-super", "ADMIN");
    await prisma.user.update({
      where: { id: superadmin.id },
      data: { isSuperAdmin: true },
    });
    admin = await createActor(app, "switch-admin", "ADMIN");
    await prisma.instanceSettings.update({
      where: { id: 1 },
      data: { orgThemingAllowed: false },
    });
  });

  afterAll(async () => {
    await prisma.instanceSettings.update({
      where: { id: 1 },
      data: { orgThemingAllowed: false },
    });
    await app.close();
  });

  it("orgThemingAllowed is off by default and themingEnabled is on", async () => {
    const settings = await http
      .get("/api/v1/instance/settings")
      .set(superadmin.auth)
      .expect(200);
    expect(settings.body.orgThemingAllowed).toBe(false);
    const list = await http
      .get("/api/v1/instance/organizations")
      .set(superadmin.auth)
      .expect(200);
    const row = list.body.find((o: { id: string }) => o.id === admin.orgId);
    expect(row.themingEnabled).toBe(true);
  });

  it("only the superadmin changes the master switch", async () => {
    await patchSettings({ orgThemingAllowed: true }, admin).expect(403);
    await http
      .patch("/api/v1/instance/settings")
      .send({ orgThemingAllowed: true })
      .expect(401);
    await patchSettings({ orgThemingAllowed: "yes" }).expect(400);
    const res = await patchSettings({ orgThemingAllowed: true }).expect(200);
    expect(res.body.orgThemingAllowed).toBe(true);
    const stored = await prisma.instanceSettings.findUniqueOrThrow({
      where: { id: 1 },
    });
    expect(stored.orgThemingAllowed).toBe(true);
  });

  it("only the superadmin changes an organization's switch", async () => {
    await patchOrg(admin.orgId, { themingEnabled: false }, admin).expect(403);
    await patchOrg(admin.orgId, { themingEnabled: false }).expect(200);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: admin.orgId },
    });
    expect(org.themingEnabled).toBe(false);
    const list = await http
      .get("/api/v1/instance/organizations")
      .set(superadmin.auth)
      .expect(200);
    expect(
      list.body.find((o: { id: string }) => o.id === admin.orgId)
        .themingEnabled,
    ).toBe(false);
  });

  it("audits the master switch with no organization, only when it changes", async () => {
    await patchSettings({ orgThemingAllowed: false }).expect(200);
    const before = await prisma.auditLog.findMany({
      where: { action: "InstanceSettings.SET_ORG_THEMING" },
    });
    await patchSettings({ orgThemingAllowed: false }).expect(200); // no-op
    expect(
      await prisma.auditLog.count({
        where: { action: "InstanceSettings.SET_ORG_THEMING" },
      }),
    ).toBe(before.length);

    await patchSettings({ orgThemingAllowed: true }).expect(200);
    const after = await prisma.auditLog.findMany({
      where: { action: "InstanceSettings.SET_ORG_THEMING" },
      orderBy: { createdAt: "desc" },
    });
    expect(after.length).toBe(before.length + 1);
    expect(after[0]).toMatchObject({
      organizationId: null,
      entityType: "InstanceSettings",
      entityId: "1",
      actorId: superadmin.id,
      oldValues: { orgThemingAllowed: false },
      newValues: { orgThemingAllowed: true },
    });
  });

  it("audits an organization's switch in that organization, only when it changes", async () => {
    await patchOrg(admin.orgId, { themingEnabled: true }).expect(200);
    const before = (await rows("Organization.SET_THEMING", admin.orgId)).length;
    await patchOrg(admin.orgId, { themingEnabled: true }).expect(200); // no-op
    expect((await rows("Organization.SET_THEMING", admin.orgId)).length).toBe(
      before,
    );

    await patchOrg(admin.orgId, { themingEnabled: false }).expect(200);
    const after = await rows("Organization.SET_THEMING", admin.orgId);
    expect(after.length).toBe(before + 1);
    expect(after[0]).toMatchObject({
      organizationId: admin.orgId,
      entityType: "Organization",
      entityId: admin.orgId,
      actorId: superadmin.id,
      oldValues: { themingEnabled: true },
      newValues: { themingEnabled: false },
    });
    // It shows in that organization's Activity.
    const activity = await http
      .get("/api/v1/org/activity")
      .set(admin.auth)
      .expect(200);
    expect(
      activity.body.items.some(
        (e: { action: string }) => e.action === "Organization.SET_THEMING",
      ),
    ).toBe(true);
  });
});
