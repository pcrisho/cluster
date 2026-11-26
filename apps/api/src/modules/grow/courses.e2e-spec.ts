import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { EMPTY_QUIZ } from "./quiz-content";

describe("GROW courses e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let author: TestActor;
  let member: TestActor;
  let outsider: TestActor;

  const call = (
    who: TestActor,
    method: "get" | "post" | "patch" | "delete",
    path: string,
    body?: object,
  ) => {
    const req = http[method](`/api/v1/grow${path}`).set(who.auth);
    return body ? req.send(body) : req;
  };
  const newCourse = async (who: TestActor = author, title = "Fire safety") =>
    (await call(who, "post", "/courses", { title }).expect(201)).body
      .id as string;
  /** A course with one lesson, ready to publish. */
  const readyCourse = async (title = "Ready") => {
    const id = await newCourse(author, title);
    const section = (
      await call(author, "post", `/courses/${id}/sections`, {
        title: "Basics",
      }).expect(201)
    ).body.id;
    await call(author, "post", `/sections/${section}/steps`, {
      type: "LESSON",
      title: "Intro",
    }).expect(201);
    return id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "gc-admin", "ADMIN");
    author = await createActor(app, "gc-author", "COLLABORATOR", admin.orgId);
    member = await createActor(app, "gc-member", "MANAGER", admin.orgId);
    outsider = await createActor(app, "gc-out", "ADMIN");
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
  });

  afterAll(async () => app?.close());

  it("persists an optional description at creation and validates its limit", async () => {
    const res = await call(author, "post", "/courses", {
      title: "Description at creation",
      description: "What you will learn",
    }).expect(201);
    expect(res.body.description).toBe("What you will learn");
    expect(
      (await prisma.course.findUniqueOrThrow({ where: { id: res.body.id } }))
        .description,
    ).toBe("What you will learn");
    const empty = await call(author, "post", "/courses", {
      title: "No description",
      description: "   ",
    }).expect(201);
    expect(empty.body.description).toBeNull();
    await call(author, "post", "/courses", {
      title: "Too long",
      description: "x".repeat(2001),
    }).expect(400);
  });

  it("paginates after filtering and sorting, with stable ties and org-scoped totals", async () => {
    const owner = await createActor(app, "gc-pagination", "ADMIN");
    const ids = await Promise.all(
      ["Gamma", "Alpha", "Beta", "Beta"].map((title) =>
        newCourse(owner, title),
      ),
    );
    const list = async (query: string) =>
      (await call(owner, "get", `/manage/courses?${query}`).expect(200)).body;
    const first = await list("pageSize=2&sort=title&order=asc");
    const second = await list("pageSize=2&page=2&sort=title&order=asc");
    const betas = [ids[2], ids[3]].sort();
    expect(first).toMatchObject({ total: 4, page: 1, pageSize: 2 });
    expect(first.items.map((c: { id: string }) => c.id)).toEqual([
      ids[1],
      betas[0],
    ]);
    expect(second.items.map((c: { id: string }) => c.id)).toEqual([
      betas[1],
      ids[0],
    ]);
    const descending = await list("pageSize=2&sort=title&order=desc");
    expect(descending.items[0].id).toBe(ids[0]);
    const filtered = await list(
      "q=beta&status=DRAFT&pageSize=2&page=99&sort=title",
    );
    expect(filtered).toMatchObject({ total: 2, page: 1 });
    expect(filtered.items.map((c: { id: string }) => c.id)).toEqual(betas);
    const empty = await list("status=PUBLISHED&page=99");
    expect(empty).toMatchObject({ items: [], total: 0, page: 1 });
    const tieDate = new Date("2026-01-01T00:00:00Z");
    await prisma.course.updateMany({
      where: { organizationId: owner.orgId },
      data: { updatedAt: tieDate },
    });
    const updated = await list("pageSize=2&sort=updatedAt&order=desc");
    expect(updated.items.map((c: { id: string }) => c.id)).toEqual(
      [...ids].sort().slice(0, 2),
    );
    const foreign = await call(
      outsider,
      "get",
      "/manage/courses?q=Beta",
    ).expect(200);
    expect(foreign.body).toMatchObject({ items: [], total: 0 });
    for (const invalid of [
      "page=0",
      "page=1.5",
      "pageSize=51",
      "pageSize=0",
      "sort=id",
      "order=up",
    ]) {
      await call(owner, "get", `/manage/courses?${invalid}`).expect(400);
    }
  });

  describe("authoring needs the capability", () => {
    it("a member without GROW_COURSE_MANAGE cannot create or list courses to manage", async () => {
      await call(member, "post", "/courses", { title: "Nope" }).expect(403);
      await call(member, "get", "/manage/courses").expect(403);
      await call(admin, "get", "/manage/courses").expect(200);
    });

    it("creates a draft owned by its author, audited", async () => {
      const res = await call(author, "post", "/courses", {
        title: "  Onboarding  ",
        iconType: "EMOJI",
        emoji: "🎓",
      }).expect(201);
      expect(res.body).toMatchObject({
        title: "Onboarding",
        description: null,
        status: "DRAFT",
        iconType: "EMOJI",
        emoji: "🎓",
        issuesCertificate: true,
      });
      const row = await prisma.course.findUniqueOrThrow({
        where: { id: res.body.id },
      });
      expect(row.createdById).toBe(author.id);
      expect(
        await prisma.auditLog.count({
          where: { entityId: res.body.id, action: "Course.CREATE" },
        }),
      ).toBe(1);
    });

    it("validates the course fields", async () => {
      await call(author, "post", "/courses", { title: "" }).expect(400);
      await call(author, "post", "/courses", { title: "x".repeat(201) }).expect(
        400,
      );
      await call(author, "post", "/courses", {
        title: "Emoji",
        iconType: "EMOJI",
      }).expect(400);
      const id = await newCourse();
      await call(author, "patch", `/courses/${id}`, {
        description: "x".repeat(2001),
      }).expect(400);
      await call(author, "patch", `/courses/${id}`, { title: " " }).expect(400);
    });

    it("a draft is invisible to members, visible to every course manager", async () => {
      const id = await newCourse(admin);
      await call(member, "get", `/courses/${id}/edit`).expect(404);
      await call(member, "patch", `/courses/${id}`, { title: "x" }).expect(404);
      await call(author, "get", `/courses/${id}/edit`).expect(200);
      const list = (await call(author, "get", "/manage/courses").expect(200))
        .body.items as { id: string }[];
      expect(list.map((c) => c.id)).toContain(id);
    });
  });

  describe("settings", () => {
    it("updates title, description, icon and switches, audited", async () => {
      const id = await newCourse();
      const res = await call(author, "patch", `/courses/${id}`, {
        title: "Renamed",
        description: "What you learn",
        iconType: "LUCIDE",
        icon: "shield",
        restricted: true,
        sequential: true,
        issuesCertificate: false,
      }).expect(200);
      expect(res.body).toMatchObject({
        title: "Renamed",
        description: "What you learn",
        icon: "shield",
        restricted: true,
        sequential: true,
        issuesCertificate: false,
      });
      expect(
        await prisma.auditLog.count({
          where: { entityId: id, action: "Course.UPDATE" },
        }),
      ).toBe(1);
      await call(author, "patch", `/courses/${id}`, {
        description: null,
      }).expect(200);
      expect(
        (await prisma.course.findUniqueOrThrow({ where: { id } })).description,
      ).toBeNull();
    });

    it("lists with status and text filters", async () => {
      const id = await newCourse(author, "Forklift zebra");
      const found = (
        await call(
          author,
          "get",
          "/manage/courses?q=zebra&status=DRAFT",
        ).expect(200)
      ).body.items;
      expect(found.map((c: { id: string }) => c.id)).toEqual([id]);
      expect(found[0]).toMatchObject({
        sectionCount: 0,
        stepCount: 0,
        createdBy: { id: author.id },
      });
      expect(
        (
          await call(
            author,
            "get",
            "/manage/courses?q=zebra&status=PUBLISHED",
          ).expect(200)
        ).body.items,
      ).toEqual([]);
      await call(author, "get", "/manage/courses?status=NOPE").expect(400);
    });
  });

  describe("publish, archive, restore, delete", () => {
    it("counts each course's learners and completions", async () => {
      const id = await readyCourse("Counted");
      await call(author, "post", `/courses/${id}/publish`).expect(200);
      const step = await prisma.courseStep.findFirstOrThrow({
        where: { courseId: id },
      });
      await call(member, "post", `/courses/${id}/enroll`).expect(200);
      await call(
        admin,
        "post",
        `/courses/${id}/steps/${step.id}/complete`,
      ).expect(200);

      const list = (
        await call(author, "get", "/manage/courses?q=Counted").expect(200)
      ).body.items as {
        id: string;
        learnerCount: number;
        completedCount: number;
      }[];
      expect(list.find((c) => c.id === id)).toMatchObject({
        learnerCount: 2,
        completedCount: 1,
      });
    });

    it("publishing lists every problem at once", async () => {
      const empty = await newCourse();
      const res = await call(
        author,
        "post",
        `/courses/${empty}/publish`,
      ).expect(400);
      expect(res.body).toMatchObject({
        code: "COURSE_INVALID",
        problems: [{ code: "NO_STEPS" }],
      });

      const id = await readyCourse();
      const section = (
        await prisma.courseSection.findFirstOrThrow({ where: { courseId: id } })
      ).id;
      const quiz = (
        await call(author, "post", `/sections/${section}/steps`, {
          type: "QUIZ",
          title: "Check",
        }).expect(201)
      ).body.id;
      const bad = await call(author, "post", `/courses/${id}/publish`).expect(
        400,
      );
      expect(bad.body.problems).toEqual([
        {
          sectionId: section,
          stepId: quiz,
          code: "QUIZ_NEEDS_QUESTION",
          title: "Check",
        },
      ]);
    });

    it("publishes once, sets publishedAt and then refuses to delete", async () => {
      const id = await readyCourse();
      const res = await call(author, "post", `/courses/${id}/publish`).expect(
        200,
      );
      expect(res.body.status).toBe("PUBLISHED");
      expect(res.body.publishedAt).toBeTruthy();
      await call(author, "post", `/courses/${id}/publish`).expect(409);
      const del = await call(author, "delete", `/courses/${id}`).expect(409);
      expect(del.body).toMatchObject({
        code: "COURSE_PUBLISHED",
        message: "Archive it instead",
      });
      expect(
        await prisma.auditLog.count({
          where: { entityId: id, action: "Course.PUBLISH" },
        }),
      ).toBe(1);
      // published and open: a member can see it exists but not manage it
      await call(member, "patch", `/courses/${id}`, { title: "x" }).expect(403);
    });

    it("archives and restores, keeping publishedAt; archived courses are invisible to members", async () => {
      const id = await readyCourse();
      await call(author, "post", `/courses/${id}/archive`).expect(409); // still a draft
      const published = (
        await call(author, "post", `/courses/${id}/publish`).expect(200)
      ).body.publishedAt;
      expect(
        (await call(author, "post", `/courses/${id}/archive`).expect(200)).body
          .status,
      ).toBe("ARCHIVED");
      await call(member, "patch", `/courses/${id}`, { title: "x" }).expect(404);
      await call(author, "post", `/courses/${id}/restore`).expect(200);
      const row = await prisma.course.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe("PUBLISHED");
      expect(row.publishedAt?.toISOString()).toBe(published);
      await call(author, "post", `/courses/${id}/restore`).expect(409);
      await call(author, "delete", `/courses/${id}`).expect(409);
      const actions = (
        await prisma.auditLog.findMany({
          where: { entityId: id },
          select: { action: true },
        })
      ).map((a) => a.action);
      expect(actions).toEqual(
        expect.arrayContaining(["Course.ARCHIVE", "Course.RESTORE"]),
      );
    });

    it("restoring runs the publish checks again", async () => {
      const id = await readyCourse();
      await call(author, "post", `/courses/${id}/publish`).expect(200);
      await call(author, "post", `/courses/${id}/archive`).expect(200);
      const step = await prisma.courseStep.findFirstOrThrow({
        where: { courseId: id },
      });
      await call(author, "patch", `/steps/${step.id}`, {
        title: "Still here",
      }).expect(200);
      await call(author, "delete", `/steps/${step.id}`).expect(204);
      expect(
        (await call(author, "post", `/courses/${id}/restore`).expect(400)).body
          .code,
      ).toBe("COURSE_INVALID");
    });

    it("deletes a never-published draft with its outline and assignments, audited", async () => {
      const id = await readyCourse();
      await prisma.courseAssignment.create({
        data: { courseId: id, userId: member.id, createdById: author.id },
      });
      await call(member, "delete", `/courses/${id}`).expect(404);
      await call(author, "delete", `/courses/${id}`).expect(204);
      expect(await prisma.course.count({ where: { id } })).toBe(0);
      expect(await prisma.courseStep.count({ where: { courseId: id } })).toBe(
        0,
      );
      expect(
        await prisma.courseAssignment.count({ where: { courseId: id } }),
      ).toBe(0);
      expect(
        await prisma.auditLog.count({
          where: { entityId: id, action: "Course.DELETE" },
        }),
      ).toBe(1);
    });
  });

  describe("isolation", () => {
    it("another organization reaches none of the routes and changes nothing", async () => {
      const id = await readyCourse("Isolated");
      const section = (
        await prisma.courseSection.findFirstOrThrow({ where: { courseId: id } })
      ).id;
      const step = (
        await prisma.courseStep.findFirstOrThrow({ where: { courseId: id } })
      ).id;
      const routes: ["get" | "post" | "patch" | "delete", string, object?][] = [
        ["get", `/courses/${id}/edit`],
        ["patch", `/courses/${id}`, { title: "Hacked" }],
        ["post", `/courses/${id}/publish`],
        ["post", `/courses/${id}/archive`],
        ["post", `/courses/${id}/restore`],
        ["delete", `/courses/${id}`],
        ["post", `/courses/${id}/sections`, { title: "x" }],
        ["patch", `/sections/${section}`, { title: "x" }],
        ["patch", `/sections/${section}/move`, { position: 0 }],
        ["post", `/sections/${section}/steps`, { type: "LESSON", title: "x" }],
        ["patch", `/steps/${step}`, { title: "x" }],
        ["patch", `/steps/${step}/move`, { sectionId: section, position: 0 }],
        ["delete", `/steps/${step}`],
        ["delete", `/sections/${section}`],
      ];
      for (const [method, path, body] of routes) {
        const res = await call(outsider, method, path, body);
        expect([path, res.status]).toEqual([path, 404]);
      }
      const files = await http
        .post(`/api/v1/grow/courses/${id}/files`)
        .set(outsider.auth)
        .attach("file", Buffer.from("%PDF-1.4"), {
          filename: "a.pdf",
          contentType: "application/pdf",
        });
      expect(files.status).toBe(404);
      expect(
        (await prisma.course.findUniqueOrThrow({ where: { id } })).title,
      ).toBe("Isolated");
      expect(await prisma.courseStep.count({ where: { courseId: id } })).toBe(
        1,
      );
      const listed = (
        await call(outsider, "get", "/manage/courses").expect(200)
      ).body.items as { id: string }[];
      expect(listed.map((c) => c.id)).not.toContain(id);
    });

    it("answers 403 when the organization has GROW switched off", async () => {
      const off = await createActor(app, "gc-off", "ADMIN");
      await prisma.organization.update({
        where: { id: off.orgId },
        data: { enabledModules: ["KNOW"] },
      });
      await call(off, "get", "/manage/courses").expect(403);
      await call(off, "post", "/courses", { title: "x" }).expect(403);
    });
  });

  it("keeps quiz defaults sane", async () => {
    const id = await newCourse();
    const section = (
      await call(author, "post", `/courses/${id}/sections`, {
        title: "S",
      }).expect(201)
    ).body.id;
    const quiz = (
      await call(author, "post", `/sections/${section}/steps`, {
        type: "QUIZ",
        title: "Q",
      }).expect(201)
    ).body;
    expect(quiz.content).toEqual(EMPTY_QUIZ);
  });
});
