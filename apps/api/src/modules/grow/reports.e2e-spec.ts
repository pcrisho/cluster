import { INestApplication } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

/** Compliance report: who must take what, where they are, and who may see it. */
describe("GROW reports e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let manager: TestActor;
  let author: TestActor;
  let areaManager: TestActor;
  let nobody: TestActor;
  let outsider: TestActor;
  let m1: TestActor;
  let m2: TestActor;
  let m3: TestActor;
  let plant: string;
  let plantNight: string;
  let office: string;
  let welder: string;
  const courses: Record<string, { id: string; lesson: string; quiz?: string }> =
    {};

  type Row = {
    userId: string;
    name: string;
    area: { id: string; name: string } | null;
    position: { id: string; name: string } | null;
    courseId: string;
    courseStatus: string;
    mandatory: boolean;
    state: string;
    progress: { done: number; total: number };
    dueAt: string | null;
    completedAt: string | null;
    bestScore: number | null;
    attempts: number;
    certificateCode: string | null;
  };
  type Report = {
    rows: Row[];
    total: number;
    page: number;
    pageSize: number;
    summary: Record<string, number>;
    filters: {
      courses: { id: string; name: string; archived: boolean }[];
      areas: { id: string; name: string }[];
      positions: { id: string; name: string }[];
    };
  };

  const report = async (who: TestActor, query = "") =>
    (
      await http
        .get(`/api/v1/grow/reports/compliance${query}`)
        .set(who.auth)
        .expect(200)
    ).body as Report;
  /** Rows of this test's courses, as "member:course:state". */
  const keys = (r: Report) =>
    r.rows
      .filter((row) =>
        Object.values(courses).some((c) => c.id === row.courseId),
      )
      .map((row) => {
        const member = [m1, m2, m3].findIndex((m) => m.id === row.userId) + 1;
        const course = Object.keys(courses).find(
          (k) => courses[k].id === row.courseId,
        );
        return `m${member}:${course}:${row.state}`;
      })
      .sort();

  const makeCourse = async (
    key: string,
    status: "PUBLISHED" | "ARCHIVED",
    withQuiz = false,
  ) => {
    const c = await prisma.course.create({
      data: {
        organizationId: admin.orgId,
        title: `Report ${key}`,
        createdById: admin.id,
        status,
        publishedAt: new Date(),
      },
    });
    const section = await prisma.courseSection.create({
      data: { courseId: c.id, title: "S", position: 0 },
    });
    const lesson = await prisma.courseStep.create({
      data: {
        courseId: c.id,
        sectionId: section.id,
        type: "LESSON",
        title: "Read",
        position: 0,
        content: {
          kind: "text",
          doc: { type: "doc", content: [{ type: "paragraph" }] },
        },
      },
    });
    const quiz = withQuiz
      ? await prisma.courseStep.create({
          data: {
            courseId: c.id,
            sectionId: section.id,
            type: "QUIZ",
            title: "Check",
            position: 1,
            content: {
              passScore: 50,
              bankSize: null,
              shuffle: false,
              showCorrectAnswers: false,
              questions: [
                {
                  id: "q1",
                  type: "single",
                  prompt: "A?",
                  points: 1,
                  options: [
                    { id: "a", text: "A" },
                    { id: "b", text: "B" },
                  ],
                  correct: ["a"],
                },
              ],
            } as Prisma.InputJsonValue,
          },
        })
      : null;
    courses[key] = { id: c.id, lesson: lesson.id, quiz: quiz?.id };
    return courses[key];
  };
  const assign = (
    courseId: string,
    data: Partial<Prisma.CourseAssignmentUncheckedCreateInput>,
  ) =>
    prisma.courseAssignment.create({
      data: { courseId, createdById: admin.id, mandatory: true, ...data },
    });
  const post = (who: TestActor, path: string, body: object = {}) =>
    http.post(`/api/v1/grow${path}`).set(who.auth).send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "rp-admin", "ADMIN");
    manager = await createActor(app, "rp-manager", "MANAGER", admin.orgId);
    author = await createActor(app, "rp-author", "COLLABORATOR", admin.orgId);
    areaManager = await createActor(
      app,
      "rp-boss",
      "COLLABORATOR",
      admin.orgId,
    );
    nobody = await createActor(app, "rp-nobody", "COLLABORATOR", admin.orgId);
    outsider = await createActor(app, "rp-out", "ADMIN");
    m1 = await createActor(app, "rp-one", "COLLABORATOR", admin.orgId);
    m2 = await createActor(app, "rp-two", "COLLABORATOR", admin.orgId);
    m3 = await createActor(app, "rp-three", "COLLABORATOR", admin.orgId);
    await prisma.user.update({
      where: { id: m3.id },
      data: { firstName: "=HYPERLINK(1)" },
    });
    await prisma.organization.update({
      where: { id: admin.orgId },
      data: { timezone: "America/Lima" },
    });
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
    plant = (
      await prisma.orgNode.create({
        data: {
          name: "Plant",
          organizationId: admin.orgId,
          managerId: areaManager.id,
        },
      })
    ).id;
    plantNight = (
      await prisma.orgNode.create({
        data: {
          name: "Plant night",
          organizationId: admin.orgId,
          parentId: plant,
        },
      })
    ).id;
    office = (
      await prisma.orgNode.create({
        data: { name: "Office", organizationId: admin.orgId },
      })
    ).id;
    welder = (
      await prisma.position.create({
        data: {
          name: "Welder",
          organizationId: admin.orgId,
          createdById: admin.id,
        },
      })
    ).id;
    await prisma.userProfile.createMany({
      data: [
        { userId: m1.id, orgNodeId: plant, positionId: welder },
        { userId: m2.id, orgNodeId: plantNight },
        { userId: m3.id, orgNodeId: office },
      ],
    });

    // A: mandatory for Plant (and Plant night), due yesterday; m1 completes it after a failed try.
    const a = await makeCourse("A", "PUBLISHED", true);
    await assign(a.id, { orgNodeId: plant, dueAt: new Date("2000-01-01") });
    await post(m1, `/courses/${a.id}/steps/${a.lesson}/complete`).expect(200);
    for (const answer of ["b", "a"]) {
      const attempt = await post(
        m1,
        `/courses/${a.id}/steps/${a.quiz}/attempts`,
      ).expect(201);
      await post(m1, `/attempts/${attempt.body.id}/submit`, {
        answers: { q1: [answer] },
      }).expect(200);
    }
    // B: mandatory for Office, due far ahead.
    const b = await makeCourse("B", "PUBLISHED");
    await assign(b.id, { orgNodeId: office, dueAt: new Date("2999-01-01") });
    // C: archived, was mandatory for Plant.
    const c = await makeCourse("C", "ARCHIVED");
    await assign(c.id, { orgNodeId: plant });
    // D: open course m3 started on their own.
    const d = await makeCourse("D", "PUBLISHED");
    await post(m3, `/courses/${d.id}/enroll`).expect(200);
  });

  afterAll(async () => app?.close());

  it("lists one row per member and mandatory published course, with status, progress, due date, best score and attempts", async () => {
    const r = await report(admin);
    expect(keys(r)).toEqual([
      "m1:A:COMPLETED",
      "m2:A:OVERDUE",
      "m3:B:NOT_STARTED",
    ]);
    const done = r.rows.find(
      (row) => row.userId === m1.id && row.courseId === courses.A.id,
    )!;
    expect(done).toMatchObject({
      mandatory: true,
      progress: { done: 2, total: 2 },
      dueAt: "2000-01-01",
      bestScore: 100,
      attempts: 2,
      area: { id: plant, name: "Plant" },
      position: { id: welder, name: "Welder" },
    });
    expect(done.completedAt).not.toBeNull();
    // Overdue first, completed last.
    expect(r.rows[0].state).toBe("OVERDUE");
  });

  it("scope=all adds archived courses and voluntary enrolments", async () => {
    expect(keys(await report(admin, "?scope=all"))).toEqual([
      "m1:A:COMPLETED",
      "m1:C:NOT_STARTED",
      "m2:A:OVERDUE",
      "m2:C:NOT_STARTED",
      "m3:B:NOT_STARTED",
      "m3:D:IN_PROGRESS",
    ]);
  });

  it("shows ADMIN, tenant MANAGER and course managers everything; an area manager their area and below; others 403", async () => {
    const everyone = ["m1:A:COMPLETED", "m2:A:OVERDUE", "m3:B:NOT_STARTED"];
    expect(keys(await report(manager))).toEqual(everyone);
    expect(keys(await report(author))).toEqual(everyone);
    expect(keys(await report(areaManager))).toEqual([
      "m1:A:COMPLETED",
      "m2:A:OVERDUE",
    ]);
    const scoped = await report(areaManager);
    expect(scoped.filters.areas.map((area) => area.id).sort()).toEqual(
      [plant, plantNight].sort(),
    );
    expect(scoped.filters.areas.map((area) => area.id)).not.toContain(office);
    await http
      .get("/api/v1/grow/reports/compliance")
      .set(nobody.auth)
      .expect(403);
    await http
      .get("/api/v1/grow/reports/compliance/export")
      .set(nobody.auth)
      .expect(403);
    expect(keys(await report(outsider))).toEqual([]);
  });

  it("dashboard: figures from the same rows, filters and scope as the report", async () => {
    type Dashboard = {
      total: number;
      summary: Record<string, number>;
      completionRate: number | null;
      courses: { id: string; title: string; total: number }[];
      areas: { id: string | null; name: string; rate: number }[];
      weekly: { week: string; completed: number }[];
      attention: { userId: string; courseTitle: string; dueAt: string }[];
      filters: Report["filters"];
    };
    const dashboard = async (who: TestActor, query = "") =>
      (
        await http
          .get(`/api/v1/grow/reports/compliance/dashboard${query}`)
          .set(who.auth)
          .expect(200)
      ).body as Dashboard;

    const d = await dashboard(admin);
    expect(d.total).toBe(3);
    expect(d.summary).toEqual({
      NOT_STARTED: 1,
      IN_PROGRESS: 0,
      COMPLETED: 1,
      OVERDUE: 1,
    });
    expect(d.completionRate).toBe(33);
    expect(d.courses.map((c) => [c.title, c.total])).toEqual([
      ["Report A", 2],
      ["Report B", 1],
    ]);
    expect(d.areas.map((a) => [a.name, a.rate])).toEqual([
      ["Office", 0],
      ["Plant night", 0],
      ["Plant", 100],
    ]);
    expect(d.attention).toEqual([
      {
        userId: m2.id,
        name: expect.any(String),
        courseId: courses.A.id,
        courseTitle: "Report A",
        dueAt: "2000-01-01",
      },
    ]);
    expect(d.weekly).toHaveLength(12);
    expect(d.weekly.at(-1)!.completed).toBe(1);

    expect((await dashboard(admin, `?courseId=${courses.B.id}`)).total).toBe(1);
    const scoped = await dashboard(areaManager);
    expect(scoped.total).toBe(2);
    expect(scoped.areas.map((a) => a.name)).not.toContain("Office");
    // The same filter options as the report, scoped the same way.
    expect(scoped.filters).toEqual((await report(areaManager)).filters);
    await http
      .get("/api/v1/grow/reports/compliance/dashboard")
      .set(nobody.auth)
      .expect(403);
    expect((await dashboard(outsider)).total).toBe(0);
  });

  it("the session tells the web whether the person manages an area (to show Reports)", async () => {
    const me = (who: TestActor) =>
      http.get("/api/v1/auth/me").set(who.auth).expect(200);
    expect((await me(areaManager)).body.user.managesArea).toBe(true);
    expect((await me(nobody)).body.user.managesArea).toBe(false);
  });

  it("filters by course, area (with sub-areas), position, status and name, and pages", async () => {
    expect(keys(await report(admin, `?courseId=${courses.B.id}`))).toEqual([
      "m3:B:NOT_STARTED",
    ]);
    expect(
      (await report(admin, `?courseId=${courses.B.id}`)).filters.courses.map(
        (course) => course.id,
      ),
    ).toEqual(expect.arrayContaining([courses.A.id, courses.B.id]));
    expect(keys(await report(admin, `?orgNodeId=${plant}`))).toEqual([
      "m1:A:COMPLETED",
      "m2:A:OVERDUE",
    ]);
    expect(keys(await report(admin, `?positionId=${welder}`))).toEqual([
      "m1:A:COMPLETED",
    ]);
    expect(keys(await report(admin, "?status=OVERDUE"))).toEqual([
      "m2:A:OVERDUE",
    ]);
    expect(keys(await report(admin, "?q=rp-two"))).toEqual(["m2:A:OVERDUE"]);

    const filtered = await report(
      admin,
      `?orgNodeId=${plant}&pageSize=1&page=2`,
    );
    expect(filtered).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(filtered.rows).toHaveLength(1);
    // The tiles count the filtered rows by status, whatever the status filter.
    expect(
      (await report(admin, `?orgNodeId=${plant}&status=COMPLETED`)).summary,
    ).toMatchObject({ COMPLETED: 1, OVERDUE: 1 });
    await http
      .get("/api/v1/grow/reports/compliance?pageSize=500")
      .set(admin.auth)
      .expect(400);
  });

  it("applies several values of one filter as OR and different filters as AND", async () => {
    const keysOf = async (query: string) =>
      keys(await report(admin, query)).sort();
    const union = (...lists: string[][]) => [...new Set(lists.flat())].sort();
    const everything = await keysOf("");

    expect(await keysOf(`?courseId=${courses.A.id},${courses.B.id}`)).toEqual(
      everything,
    );
    expect(
      await keysOf(`?courseId=${courses.A.id}&courseId=${courses.B.id}`),
    ).toEqual(everything);
    expect(await keysOf(`?courseId=${courses.B.id}`)).toEqual([
      "m3:B:NOT_STARTED",
    ]);
    expect(await keysOf(`?orgNodeId=${plant},${office}`)).toEqual(
      union(
        await keysOf(`?orgNodeId=${plant}`),
        await keysOf(`?orgNodeId=${office}`),
      ),
    );
    expect(await keysOf("?status=OVERDUE,NOT_STARTED")).toEqual(
      union(
        await keysOf("?status=OVERDUE"),
        await keysOf("?status=NOT_STARTED"),
      ),
    );
    expect(
      await keysOf(`?orgNodeId=${plant}&status=NOT_STARTED,OVERDUE`),
    ).toEqual(["m2:A:OVERDUE"]);

    await http
      .get("/api/v1/grow/reports/compliance?courseId=not-a-uuid")
      .set(admin.auth)
      .expect(400);
    await http
      .get("/api/v1/grow/reports/compliance?status=OVERDUE,BOGUS")
      .set(admin.auth)
      .expect(400);
  });

  it("orders by status or due date, either way", async () => {
    const states = async (query: string) =>
      (await report(admin, query)).rows.map((row) => row.state);
    // Status (default): overdue, then due soonest, completed last.
    expect(await states("")).toEqual(["OVERDUE", "NOT_STARTED", "COMPLETED"]);
    expect(await states("?sort=status&order=desc")).toEqual([
      "COMPLETED",
      "NOT_STARTED",
      "OVERDUE",
    ]);
    // Due date: ties keep the status order.
    expect(await states("?sort=due")).toEqual([
      "OVERDUE",
      "COMPLETED",
      "NOT_STARTED",
    ]);
    expect(await states("?sort=due&order=desc")).toEqual([
      "NOT_STARTED",
      "OVERDUE",
      "COMPLETED",
    ]);
    await http
      .get("/api/v1/grow/reports/compliance?sort=name")
      .set(admin.auth)
      .expect(400);
  });

  it("names the certificate of a completed row", async () => {
    const rows = (await report(admin)).rows;
    const certificate = await prisma.certificate.findUniqueOrThrow({
      where: { courseId_userId: { courseId: courses.A.id, userId: m1.id } },
    });
    expect(
      rows.find((r) => r.userId === m1.id && r.courseId === courses.A.id)
        ?.certificateCode,
    ).toBe(certificate.code.match(/.{4}/g)!.join("-"));
    expect(
      rows.filter((r) => r.certificateCode !== null).map((r) => r.userId),
    ).toEqual([m1.id]);
  });

  it("matches what the learner sees for the same course", async () => {
    const row = (await report(admin)).rows.find(
      (r) => r.userId === m2.id && r.courseId === courses.A.id,
    )!;
    const overview = await http
      .get(`/api/v1/grow/courses/${courses.A.id}`)
      .set(m2.auth)
      .expect(200);
    expect(row.state).toBe(overview.body.state);
    expect(row.dueAt).toBe(overview.body.dueAt);
    expect(row.progress).toEqual(overview.body.progress);
  });

  it("exports the same rows as CSV with a BOM and formulas neutralised", async () => {
    const res = await http
      .get(`/api/v1/grow/reports/compliance/export?orgNodeId=${office}`)
      .set(admin.auth)
      .expect(200);
    expect(res.headers["content-type"]).toMatch(/^text\/csv/);
    expect(res.headers["content-disposition"]).toMatch(/attachment/);
    expect(res.text.startsWith("﻿")).toBe(true);
    const lines = res.text.slice(1).trim().split("\r\n");
    expect(lines[0]).toMatch(/^Person,Email,Area,Position,Course,Status/);
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("'=HYPERLINK(1)");
    expect(lines[1]).toContain("Report B");
  });

  it("by-main-node: aggregates mandatory compliance per active main node, matches dashboard, enforces scope and module", async () => {
    const emptyRoot = (
      await prisma.orgNode.create({
        data: { name: "Empty Root", organizationId: admin.orgId },
      })
    ).id;
    const archivedRoot = (
      await prisma.orgNode.create({
        data: {
          name: "Archived Root",
          organizationId: admin.orgId,
          isActive: false,
        },
      })
    ).id;

    type MainNodeComplianceItem = {
      mainNodeId: string;
      total: number;
      completed: number;
      overdue: number;
      inProgress: number;
      notStarted: number;
      rate: number | null;
    };

    const res = await http
      .get("/api/v1/grow/reports/compliance/by-main-node")
      .set(admin.auth)
      .expect(200);
    const items = res.body.items as MainNodeComplianceItem[];
    expect(items.map((i) => i.mainNodeId)).not.toContain(archivedRoot);

    const plantItem = items.find((i) => i.mainNodeId === plant);
    const plantDashboard = (
      await http
        .get(`/api/v1/grow/reports/compliance/dashboard?orgNodeId=${plant}`)
        .set(admin.auth)
        .expect(200)
    ).body as { total: number; completionRate: number | null };
    expect(plantItem).toEqual({
      mainNodeId: plant,
      total: 2,
      completed: 1,
      overdue: 1,
      inProgress: 0,
      notStarted: 0,
      rate: 50,
    });
    expect(plantItem?.total).toBe(plantDashboard.total);
    expect(plantItem?.rate).toBe(plantDashboard.completionRate);

    expect(items.find((i) => i.mainNodeId === office)).toEqual({
      mainNodeId: office,
      total: 1,
      completed: 0,
      overdue: 0,
      inProgress: 0,
      notStarted: 1,
      rate: 0,
    });
    expect(items.find((i) => i.mainNodeId === emptyRoot)).toEqual({
      mainNodeId: emptyRoot,
      total: 0,
      completed: 0,
      overdue: 0,
      inProgress: 0,
      notStarted: 0,
      rate: null,
    });

    // Area manager sees only their own main node; nobody gets 403; outsider sees none of admin's nodes.
    const scoped = (
      await http
        .get("/api/v1/grow/reports/compliance/by-main-node")
        .set(areaManager.auth)
        .expect(200)
    ).body.items as MainNodeComplianceItem[];
    expect(scoped.map((i) => i.mainNodeId)).toEqual([plant]);

    await http
      .get("/api/v1/grow/reports/compliance/by-main-node")
      .set(nobody.auth)
      .expect(403);

    const outItems = (
      await http
        .get("/api/v1/grow/reports/compliance/by-main-node")
        .set(outsider.auth)
        .expect(200)
    ).body.items as MainNodeComplianceItem[];
    expect(outItems.map((i) => i.mainNodeId)).not.toContain(plant);
    expect(outItems.map((i) => i.mainNodeId)).not.toContain(office);

    // When GROW is disabled for the organization, the endpoint is refused.
    await prisma.organization.update({
      where: { id: admin.orgId },
      data: { enabledModules: ["KNOW"] },
    });
    try {
      await http
        .get("/api/v1/grow/reports/compliance/by-main-node")
        .set(admin.auth)
        .expect(403);
    } finally {
      await prisma.organization.update({
        where: { id: admin.orgId },
        data: { enabledModules: ["CONNECT", "KNOW", "GROW", "LIFE"] },
      });
    }
  });
});
