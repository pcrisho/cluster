import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

describe("GROW assignments e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let author: TestActor;
  let member: TestActor;
  let outsider: TestActor;
  let area: string;
  let subArea: string;
  let position: string;

  type Entry = {
    id: string;
    principal: { type: string; id: string; name: string; detail?: string };
    archived: boolean;
    mandatory: boolean;
    dueAt: string | null;
    dueInDays: number | null;
    reachedCount: number;
  };
  const call = (
    who: TestActor,
    method: "get" | "post" | "patch" | "delete",
    path: string,
    body?: object,
  ) => {
    const req = http[method](`/api/v1/grow${path}`).set(who.auth);
    return body ? req.send(body) : req;
  };
  const course = async (publish = true) => {
    const id = (
      await call(author, "post", "/courses", { title: "Safety" }).expect(201)
    ).body.id as string;
    const section = (
      await call(author, "post", `/courses/${id}/sections`, {
        title: "S",
      }).expect(201)
    ).body.id;
    await call(author, "post", `/sections/${section}/steps`, {
      type: "LESSON",
      title: "L",
    }).expect(201);
    if (publish)
      await call(author, "post", `/courses/${id}/publish`).expect(200);
    return id;
  };
  const assign = (courseId: string, body: object, who = author) =>
    call(who, "post", `/courses/${courseId}/assignments`, body);
  const list = async (courseId: string) =>
    (await call(author, "get", `/courses/${courseId}/assignments`).expect(200))
      .body as Entry[];
  const assignedNotices = (userId: string, courseId: string) =>
    prisma.notification.count({
      where: {
        userId,
        type: "grow:course:assigned",
        link: `/grow/courses/${courseId}`,
      },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "as-admin", "ADMIN");
    author = await createActor(app, "as-author", "COLLABORATOR", admin.orgId);
    member = await createActor(app, "as-member", "COLLABORATOR", admin.orgId);
    outsider = await createActor(app, "as-out", "ADMIN");
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
    area = (
      await prisma.orgNode.create({
        data: { name: "Warehouse", organizationId: admin.orgId },
      })
    ).id;
    subArea = (
      await prisma.orgNode.create({
        data: {
          name: "Warehouse night",
          organizationId: admin.orgId,
          parentId: area,
        },
      })
    ).id;
    position = (
      await prisma.position.create({
        data: {
          name: "Forklift driver",
          organizationId: admin.orgId,
          createdById: admin.id,
        },
      })
    ).id;
    await prisma.userProfile.create({
      data: { userId: member.id, orgNodeId: subArea, positionId: position },
    });
  });

  afterAll(async () => app?.close());

  it("adds, updates and removes assignments by person, area and position, audited", async () => {
    const id = await course();
    const byUser = (
      await assign(id, {
        principalType: "USER",
        principalId: member.id,
      }).expect(201)
    ).body as Entry;
    expect(byUser).toMatchObject({
      principal: { type: "USER", id: member.id },
      mandatory: true,
      dueAt: null,
      dueInDays: null,
      reachedCount: 1,
    });

    const byArea = (
      await assign(id, {
        principalType: "ORG_NODE",
        principalId: area,
        mandatory: false,
        dueAt: "2026-12-01",
        dueInDays: 30,
      }).expect(201)
    ).body;
    expect(byArea).toMatchObject({
      principal: { name: "Warehouse" },
      mandatory: false,
      dueAt: "2026-12-01",
      dueInDays: 30,
      reachedCount: 1,
      archived: false,
    });
    await assign(id, {
      principalType: "POSITION",
      principalId: position,
    }).expect(201);
    expect((await list(id)).map((e) => e.principal.type).sort()).toEqual([
      "ORG_NODE",
      "POSITION",
      "USER",
    ]);

    const updated = (
      await call(author, "patch", `/assignments/${byArea.id}`, {
        mandatory: true,
        dueAt: null,
      }).expect(200)
    ).body;
    expect(updated).toMatchObject({
      mandatory: true,
      dueAt: null,
      dueInDays: 30,
    });

    await call(author, "delete", `/assignments/${byUser.id}`).expect(204);
    expect((await list(id)).map((e) => e.principal.type).sort()).toEqual([
      "ORG_NODE",
      "POSITION",
    ]);

    const actions = (
      await prisma.auditLog.findMany({
        where: { organizationId: admin.orgId, entityType: "CourseAssignment" },
        select: { action: true },
      })
    ).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "CourseAssignment.CREATE",
        "CourseAssignment.UPDATE",
        "CourseAssignment.DELETE",
      ]),
    );
  });

  it("adding the same principal again updates its row instead of duplicating it", async () => {
    const id = await course();
    await assign(id, {
      principalType: "ORG_NODE",
      principalId: area,
      dueInDays: 10,
    }).expect(201);
    const again = (
      await assign(id, {
        principalType: "ORG_NODE",
        principalId: area,
        mandatory: false,
        dueInDays: 20,
      }).expect(201)
    ).body;
    expect(again).toMatchObject({ mandatory: false, dueInDays: 20 });
    expect(
      await prisma.courseAssignment.count({ where: { courseId: id } }),
    ).toBe(1);
  });

  it("names the area of an assigned position that belongs to one", async () => {
    const id = await course();
    const scoped = await prisma.position.create({
      data: {
        name: "Shift lead",
        organizationId: admin.orgId,
        orgNodeId: area,
        createdById: admin.id,
      },
    });
    await assign(id, {
      principalType: "POSITION",
      principalId: scoped.id,
    }).expect(201);
    await assign(id, {
      principalType: "POSITION",
      principalId: position,
    }).expect(201);

    const rows = await list(id);
    const named = (name: string) =>
      rows.find((r) => r.principal.name === name)?.principal;
    expect(named("Shift lead")?.detail).toBe("Warehouse");
    expect(named("Forklift driver")?.detail).toBeUndefined();
  });

  it("validates due dates", async () => {
    const id = await course();
    const base = { principalType: "USER", principalId: member.id };
    for (const bad of [
      { dueAt: "2026-13-01" },
      { dueAt: "01/12/2026" },
      { dueInDays: 0 },
      { dueInDays: 366 },
      { dueInDays: 1.5 },
    ]) {
      await assign(id, { ...base, ...bad }).expect(400);
    }
    await assign(id, { ...base, principalType: "GROUP" }).expect(400);
    expect(
      await prisma.courseAssignment.count({ where: { courseId: id } }),
    ).toBe(0);
  });

  it("rejects principals of another organization and inactive ones, creating nothing", async () => {
    const id = await course();
    const foreignArea = (
      await prisma.orgNode.create({
        data: { name: "Foreign", organizationId: outsider.orgId },
      })
    ).id;
    const gone = await createActor(app, "as-gone", "COLLABORATOR", admin.orgId);
    await prisma.user.update({
      where: { id: gone.id },
      data: { isActive: false },
    });
    const archived = (
      await prisma.orgNode.create({
        data: {
          name: "Old",
          organizationId: admin.orgId,
          isActive: false,
          archivedAt: new Date(),
        },
      })
    ).id;
    const retired = (
      await prisma.position.create({
        data: {
          name: "Retired",
          organizationId: admin.orgId,
          createdById: admin.id,
          isActive: false,
        },
      })
    ).id;
    for (const body of [
      { principalType: "USER", principalId: outsider.id },
      { principalType: "ORG_NODE", principalId: foreignArea },
      { principalType: "USER", principalId: gone.id },
      { principalType: "ORG_NODE", principalId: archived },
      { principalType: "POSITION", principalId: retired },
    ]) {
      expect([400, 404]).toContain((await assign(id, body)).status);
    }
    expect(
      await prisma.courseAssignment.count({ where: { courseId: id } }),
    ).toBe(0);
  });

  it("an area archived later stays listed, flagged, and can be removed", async () => {
    const id = await course();
    const temp = (
      await prisma.orgNode.create({
        data: { name: "Temp", organizationId: admin.orgId },
      })
    ).id;
    const entry = (
      await assign(id, { principalType: "ORG_NODE", principalId: temp }).expect(
        201,
      )
    ).body;
    await prisma.orgNode.update({
      where: { id: temp },
      data: { isActive: false, archivedAt: new Date() },
    });
    expect((await list(id)).find((e) => e.id === entry.id)?.archived).toBe(
      true,
    );
    await call(author, "delete", `/assignments/${entry.id}`).expect(204);
  });

  it("only course managers manage assignments; other organizations reach nothing", async () => {
    const id = await course();
    const entry = (
      await assign(id, {
        principalType: "USER",
        principalId: member.id,
      }).expect(201)
    ).body;
    await call(member, "get", `/courses/${id}/assignments`).expect(403);
    await assign(
      id,
      { principalType: "USER", principalId: member.id },
      member,
    ).expect(403);
    await call(member, "patch", `/assignments/${entry.id}`, {
      mandatory: false,
    }).expect(403);
    await call(member, "delete", `/assignments/${entry.id}`).expect(403);

    await call(outsider, "get", `/courses/${id}/assignments`).expect(404);
    await assign(
      id,
      { principalType: "USER", principalId: outsider.id },
      outsider,
    ).expect(404);
    await call(outsider, "patch", `/assignments/${entry.id}`, {
      mandatory: false,
    }).expect(404);
    await call(outsider, "delete", `/assignments/${entry.id}`).expect(404);
    expect(
      (
        await prisma.courseAssignment.findUniqueOrThrow({
          where: { id: entry.id },
        })
      ).mandatory,
    ).toBe(true);

    const draft = await course(false);
    await call(member, "get", `/courses/${draft}/assignments`).expect(404);
  });

  describe("notifications", () => {
    it("a mandatory assignment on a published course notifies the people it reaches, once", async () => {
      const id = await course();
      const elsewhere = await createActor(
        app,
        "as-else",
        "COLLABORATOR",
        admin.orgId,
      );
      await assign(id, { principalType: "ORG_NODE", principalId: area }).expect(
        201,
      );
      expect(await assignedNotices(member.id, id)).toBe(1);
      expect(await assignedNotices(elsewhere.id, id)).toBe(0);
      // re-adding the same principal does not notify again
      await assign(id, {
        principalType: "ORG_NODE",
        principalId: area,
        dueInDays: 5,
      }).expect(201);
      expect(await assignedNotices(member.id, id)).toBe(1);
    });

    it("an optional assignment notifies nobody until it becomes mandatory", async () => {
      const id = await course();
      const entry = (
        await assign(id, {
          principalType: "USER",
          principalId: member.id,
          mandatory: false,
        }).expect(201)
      ).body;
      expect(await assignedNotices(member.id, id)).toBe(0);
      await call(author, "patch", `/assignments/${entry.id}`, {
        mandatory: true,
      }).expect(200);
      expect(await assignedNotices(member.id, id)).toBe(1);
    });

    it("on a draft, people are notified when the course is first published", async () => {
      const id = await course(false);
      await assign(id, {
        principalType: "POSITION",
        principalId: position,
      }).expect(201);
      expect(await assignedNotices(member.id, id)).toBe(0);
      await call(author, "post", `/courses/${id}/publish`).expect(200);
      expect(await assignedNotices(member.id, id)).toBe(1);
      await call(author, "post", `/courses/${id}/archive`).expect(200);
      await call(author, "post", `/courses/${id}/restore`).expect(200);
      expect(await assignedNotices(member.id, id)).toBe(1);
    });
  });
});
