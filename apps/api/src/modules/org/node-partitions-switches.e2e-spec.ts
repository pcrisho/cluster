import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { isolatedOrg, type IsolatedOrg } from "./node-partitions.helpers";

describe("Node partitions: the two switches e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let superadmin: TestActor;
  let tenantAdmin: TestActor;
  let isolated: IsolatedOrg;
  /** Organizations this suite isolated: restored in afterAll, since ISOLATION_IN_USE blocks the instance switch. */
  const touchedOrgs: string[] = [];

  const setInstance = (nodeIsolationAllowed: boolean) =>
    prisma.instanceSettings.upsert({
      where: { id: 1 },
      create: { nodeIsolationAllowed },
      update: { nodeIsolationAllowed },
    });
  const patchSettings = (body: object, actor: TestActor = superadmin) =>
    http.patch("/api/v1/instance/settings").set(actor.auth).send(body);
  const patchOrg = (body: object, actor: TestActor) =>
    http.patch("/api/v1/org").set(actor.auth).send(body);
  const patchInstanceOrg = (
    id: string,
    body: object,
    actor: TestActor = superadmin,
  ) =>
    http
      .patch(`/api/v1/instance/organizations/${id}`)
      .set(actor.auth)
      .send(body);
  const orgRow = (id: string) =>
    prisma.organization.findUniqueOrThrow({ where: { id } });
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
    superadmin = await createActor(app, "iso-super", "ADMIN");
    await prisma.user.update({
      where: { id: superadmin.id },
      data: { isSuperAdmin: true },
    });
    tenantAdmin = await createActor(app, "iso-tenant-admin", "ADMIN");
    await setInstance(false);
  });

  afterAll(async () => {
    await prisma.organization.updateMany({
      where: { id: { in: touchedOrgs } },
      data: { isolateRootNodes: false },
    });
    await setInstance(false);
    await app.close();
  });

  it("the instance switch is off by default and only the superadmin changes it", async () => {
    const settings = await http
      .get("/api/v1/instance/settings")
      .set(superadmin.auth)
      .expect(200);
    expect(settings.body.nodeIsolationAllowed).toBe(false);

    await patchSettings({ nodeIsolationAllowed: true }, tenantAdmin).expect(
      403,
    );
    await http
      .patch("/api/v1/instance/settings")
      .send({ nodeIsolationAllowed: true })
      .expect(401);
    await patchSettings({ nodeIsolationAllowed: "yes" }).expect(400);

    const on = await patchSettings({ nodeIsolationAllowed: true }).expect(200);
    expect(on.body.nodeIsolationAllowed).toBe(true);
    expect(
      (await prisma.instanceSettings.findUniqueOrThrow({ where: { id: 1 } }))
        .nodeIsolationAllowed,
    ).toBe(true);

    await patchSettings({ nodeIsolationAllowed: false }).expect(200);
    expect(
      (await prisma.instanceSettings.findUniqueOrThrow({ where: { id: 1 } }))
        .nodeIsolationAllowed,
    ).toBe(false);
  });

  it("an ADMIN cannot switch isolation on while the instance switch is off (ISOLATION_NOT_ALLOWED)", async () => {
    const admin = await createActor(app, "iso-off-admin", "ADMIN");
    const res = await patchOrg({ isolateRootNodes: true }, admin).expect(403);
    expect(res.body.code).toBe("ISOLATION_NOT_ALLOWED");
    expect((await orgRow(admin.orgId)).isolateRootNodes).toBe(false);

    // Turning it off is always allowed.
    await patchOrg({ isolateRootNodes: false }, admin).expect(200);
    const org = await http.get("/api/v1/org").set(admin.auth).expect(200);
    expect(org.body.isolation).toEqual({
      allowed: false,
      enabled: false,
      peopleWithoutNode: 0,
    });
  });

  it("a person who is not an ADMIN cannot change isolation", async () => {
    await setInstance(true);
    const collaborator = await createActor(
      app,
      "iso-collaborator",
      "COLLABORATOR",
    );
    await patchOrg({ isolateRootNodes: true }, collaborator).expect(403);
    await http.get("/api/v1/org").set(collaborator.auth).expect(403);
  });

  it("switching isolation on with LIFE enabled answers ISOLATION_MODULES, both ways, while CONNECT is allowed", async () => {
    await setInstance(true);
    const admin = await createActor(app, "iso-modules-admin", "ADMIN");
    touchedOrgs.push(admin.orgId);

    // A new organization has every module enabled (including LIFE).
    const blocked = await patchOrg({ isolateRootNodes: true }, admin).expect(
      409,
    );
    expect(blocked.body.code).toBe("ISOLATION_MODULES");

    await patchOrg({ enabledModules: ["KNOW", "GROW", "CONNECT"] }, admin).expect(200);
    await patchOrg({ isolateRootNodes: true }, admin).expect(200);
    expect((await orgRow(admin.orgId)).isolateRootNodes).toBe(true);

    const enable = await patchOrg(
      { enabledModules: ["KNOW", "GROW", "CONNECT", "LIFE"] },
      admin,
    ).expect(409);
    expect(enable.body.code).toBe("ISOLATION_MODULES");
    expect((await orgRow(admin.orgId)).enabledModules).toEqual([
      "KNOW",
      "GROW",
      "CONNECT",
    ]);

    await patchOrg({ isolateRootNodes: false }, admin).expect(200);
    await patchOrg({ enabledModules: ["KNOW", "GROW", "LIFE"] }, admin).expect(
      200,
    );
    const late = await patchOrg({ isolateRootNodes: true }, admin).expect(409);
    expect(late.body.code).toBe("ISOLATION_MODULES");
  });

  it("the superadmin cannot turn the instance switch off while an organization is isolated (ISOLATION_IN_USE)", async () => {
    await setInstance(true);
    isolated = await isolatedOrg(app);
    touchedOrgs.push(isolated.orgId);

    const res = await patchSettings({ nodeIsolationAllowed: false }).expect(
      409,
    );
    expect(res.body.code).toBe("ISOLATION_IN_USE");
    expect(res.body.organizations).toEqual(
      expect.arrayContaining([
        { id: isolated.orgId, name: expect.any(String) },
      ]),
    );
    expect(
      (await prisma.instanceSettings.findUniqueOrThrow({ where: { id: 1 } }))
        .nodeIsolationAllowed,
    ).toBe(true);
    const list = await http
      .get("/api/v1/instance/organizations")
      .set(superadmin.auth)
      .expect(200);
    expect(
      list.body.find((o: { id: string }) => o.id === isolated.orgId)
        .isolateRootNodes,
    ).toBe(true);
  });

  it("GET /org tells the ADMIN the switches and counts the people who have no node", async () => {
    const res = await http
      .get("/api/v1/org")
      .set(isolated.admin.auth)
      .expect(200);
    // Only "nobody": the crossers have no node either and are not counted, nor are a and b.
    expect(res.body.isolation).toEqual({
      allowed: true,
      enabled: true,
      peopleWithoutNode: 1,
    });

    // Deactivated people do not count.
    const inactive = await createActor(
      app,
      "iso-inactive",
      "COLLABORATOR",
      isolated.orgId,
    );
    await prisma.user.update({
      where: { id: inactive.id },
      data: { isActive: false },
    });
    const again = await http
      .get("/api/v1/org")
      .set(isolated.admin.auth)
      .expect(200);
    expect(again.body.isolation.peopleWithoutNode).toBe(1);
  });

  it("GET /auth/me reports the effective switch as organization.isolated", async () => {
    const me = await http
      .get("/api/v1/auth/me")
      .set(isolated.a.auth)
      .expect(200);
    expect(me.body.user.organization.isolated).toBe(true);
    const plain = await createActor(app, "iso-plain", "COLLABORATOR");
    const other = await http.get("/api/v1/auth/me").set(plain.auth).expect(200);
    expect(other.body.user.organization.isolated).toBe(false);
  });

  it("the instance organization list shows isolateRootNodes, and its PATCH does not set it", async () => {
    const list = await http
      .get("/api/v1/instance/organizations")
      .set(superadmin.auth)
      .expect(200);
    expect(
      list.body.find((o: { id: string }) => o.id === isolated.orgId)
        .isolateRootNodes,
    ).toBe(true);
    // Read-only there: the field is stripped, the ADMIN's switch is unchanged.
    await patchInstanceOrg(isolated.orgId, { isolateRootNodes: false }).expect(
      200,
    );
    expect((await orgRow(isolated.orgId)).isolateRootNodes).toBe(true);
  });

  it("audits the instance switch only when it changes, with no organization", async () => {
    await setInstance(true);
    const before = await rows("InstanceSettings.SET_NODE_ISOLATION", "1");
    await patchSettings({ nodeIsolationAllowed: true }).expect(200); // no-op
    expect(
      (await rows("InstanceSettings.SET_NODE_ISOLATION", "1")).length,
    ).toBe(before.length);

    await patchSettings({ nodeIsolationAllowed: false }).expect(409); // in use: nothing changes
    const latest = await rows("InstanceSettings.SET_NODE_ISOLATION", "1");
    expect(latest.length).toBe(before.length);

    // A fresh instance state for the audit: switch on again through a non-isolated path, then off.
    await prisma.organization.update({
      where: { id: isolated.orgId },
      data: { isolateRootNodes: false },
    });
    await patchSettings({ nodeIsolationAllowed: false }).expect(200);
    await patchSettings({ nodeIsolationAllowed: true }).expect(200);
    const after = await rows("InstanceSettings.SET_NODE_ISOLATION", "1");
    expect(after.length).toBe(before.length + 2);
    expect(after[0]).toMatchObject({
      organizationId: null,
      entityType: "InstanceSettings",
      entityId: "1",
      actorId: superadmin.id,
      oldValues: { nodeIsolationAllowed: false },
      newValues: { nodeIsolationAllowed: true },
    });
    // Put the isolated organization back for the tests that follow.
    await prisma.organization.update({
      where: { id: isolated.orgId },
      data: { isolateRootNodes: true },
    });
  });

  it("audits an organization's switch in that organization, only when it changes", async () => {
    await setInstance(true);
    const admin = await createActor(app, "iso-audit-admin", "ADMIN");
    await patchOrg({ enabledModules: ["KNOW", "GROW"] }, admin).expect(200);
    await patchOrg({ isolateRootNodes: true }, admin).expect(200);
    const before = (await rows("Organization.SET_ISOLATION", admin.orgId))
      .length;
    await patchOrg({ isolateRootNodes: true }, admin).expect(200); // no-op
    expect((await rows("Organization.SET_ISOLATION", admin.orgId)).length).toBe(
      before,
    );

    await patchOrg({ isolateRootNodes: false }, admin).expect(200);
    const after = await rows("Organization.SET_ISOLATION", admin.orgId);
    expect(after.length).toBe(before + 1);
    expect(after[0]).toMatchObject({
      organizationId: admin.orgId,
      entityType: "Organization",
      entityId: admin.orgId,
      actorId: admin.id,
      oldValues: { isolateRootNodes: true },
      newValues: { isolateRootNodes: false },
    });
    // The switch itself is not written as a generic Organization.UPDATE.
    const general = await rows("Organization.UPDATE", admin.orgId);
    expect(
      general.some((r) =>
        JSON.stringify(r.newValues ?? {}).includes("isolateRootNodes"),
      ),
    ).toBe(false);
  });

  it("another organization's ADMIN cannot read or change this organization's switch", async () => {
    const other = await createActor(app, "iso-other", "ADMIN");
    touchedOrgs.push(other.orgId);

    const seen = await http.get("/api/v1/org").set(other.auth).expect(200);
    expect(seen.body.isolation.enabled).toBe(false);
    const mine = await http
      .get("/api/v1/org")
      .set(isolated.admin.auth)
      .expect(200);
    expect(mine.body.isolation.enabled).toBe(true);

    // The other organization can switch its own on; this one stays as it was.
    await patchOrg({ enabledModules: ["KNOW", "GROW"] }, other).expect(200);
    await patchOrg({ isolateRootNodes: true }, other).expect(200);
    expect((await orgRow(other.orgId)).isolateRootNodes).toBe(true);
    expect((await orgRow(isolated.orgId)).isolateRootNodes).toBe(true);

    await patchInstanceOrg(
      isolated.orgId,
      { isolateRootNodes: false },
      other,
    ).expect(403);
    await patchSettings({ nodeIsolationAllowed: false }, other).expect(403);
    expect((await orgRow(isolated.orgId)).isolateRootNodes).toBe(true);
  });
});
