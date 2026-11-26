import { INestApplication } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

/** The learner side: My learning, catalog, course overview, enrolment, step reading and completion. */
describe("GROW learning e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let author: TestActor;
  let learner: TestActor;
  let outsider: TestActor;
  let area: string;
  let otherArea: string;

  type Item = {
    id: string;
    title: string;
    state: string;
    progress: { done: number; total: number };
    mandatory: boolean;
    dueAt: string | null;
    isNew: boolean;
    restricted: boolean;
  };
  type Overview = {
    id: string;
    status: string;
    state: string;
    enrollment: { status: string } | null;
    progress: { done: number; total: number };
    nextStepId: string | null;
    sections: {
      steps: { id: string; completed: boolean; locked: boolean }[];
    }[];
  };

  const LESSON = {
    kind: "text",
    doc: { type: "doc", content: [{ type: "paragraph" }] },
  };
  const QUIZ = {
    passScore: 80,
    bankSize: null,
    shuffle: false,
    showCorrectAnswers: true,
    questions: [
      {
        id: "q1",
        type: "single",
        prompt: "Pick A",
        points: 1,
        options: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
        ],
        correct: ["a"],
      },
    ],
  };

  /** A course with one section per entry; each step is a lesson unless marked "quiz", optional with "?". */
  const course = async (
    data: Partial<Prisma.CourseUncheckedCreateInput> = {},
    outline: string[][] = [["one", "two"]],
  ) => {
    const created = await prisma.course.create({
      data: {
        organizationId: admin.orgId,
        title: "Course",
        createdById: admin.id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        ...data,
      },
    });
    const steps: Record<string, string> = {};
    for (const [s, names] of outline.entries()) {
      const section = await prisma.courseSection.create({
        data: { courseId: created.id, title: `S${s}`, position: s },
      });
      for (const [p, raw] of names.entries()) {
        const name = raw.replace("?", "");
        const quiz = name.startsWith("quiz");
        steps[name] = (
          await prisma.courseStep.create({
            data: {
              courseId: created.id,
              sectionId: section.id,
              type: quiz ? "QUIZ" : "LESSON",
              title: name,
              position: p,
              required: !raw.endsWith("?"),
              content: quiz ? QUIZ : LESSON,
            },
          })
        ).id;
      }
    }
    return { id: created.id, steps };
  };
  const assign = (
    courseId: string,
    data: Partial<Prisma.CourseAssignmentUncheckedCreateInput>,
  ) =>
    prisma.courseAssignment.create({
      data: { courseId, createdById: admin.id, ...data },
    });
  const get = (who: TestActor, path: string) =>
    http.get(`/api/v1/grow${path}`).set(who.auth);
  const post = (who: TestActor, path: string) =>
    http.post(`/api/v1/grow${path}`).set(who.auth);
  const overview = async (who: TestActor, id: string) =>
    (await get(who, `/courses/${id}`).expect(200)).body as Overview;
  const learning = async (who: TestActor) =>
    (await get(who, "/learning").expect(200)).body as {
      required: Item[];
      inProgress: Item[];
      recommended: Item[];
    };
  const catalog = async (who: TestActor, query = "") =>
    (await get(who, `/catalog${query}`).expect(200)).body as {
      items: Item[];
      nextCursor: string | null;
    };
  const enrollments = (userId: string, courseId: string) =>
    prisma.enrollment.count({ where: { userId, courseId } });
  const complete = (who: TestActor, courseId: string, stepId: string) =>
    post(who, `/courses/${courseId}/steps/${stepId}/complete`);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "le-admin", "ADMIN");
    author = await createActor(app, "le-author", "COLLABORATOR", admin.orgId);
    learner = await createActor(app, "le-learner", "COLLABORATOR", admin.orgId);
    outsider = await createActor(app, "le-out", "ADMIN");
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
    area = (
      await prisma.orgNode.create({
        data: { name: "Plant", organizationId: admin.orgId },
      })
    ).id;
    otherArea = (
      await prisma.orgNode.create({
        data: { name: "Office", organizationId: admin.orgId },
      })
    ).id;
    await prisma.userProfile.create({
      data: { userId: learner.id, orgNodeId: area },
    });
  });

  afterAll(async () => app?.close());

  describe("visibility", () => {
    it("drafts, archived courses and restricted ones not assigned stay out of sight", async () => {
      const open = await course({ title: "Open" });
      const draft = await course({
        title: "Draft",
        status: "DRAFT",
        publishedAt: null,
      });
      const archived = await course({ title: "Archived", status: "ARCHIVED" });
      const restricted = await course({ title: "Hidden", restricted: true });
      const restrictedMine = await course({
        title: "Mine",
        restricted: true,
      });
      await assign(restrictedMine.id, { userId: learner.id, mandatory: false });

      const ids = (await catalog(learner, "?q=")).items.map((c) => c.id);
      expect(ids).toEqual(expect.arrayContaining([open.id, restrictedMine.id]));
      for (const hidden of [draft, archived, restricted]) {
        expect(ids).not.toContain(hidden.id);
        await get(learner, `/courses/${hidden.id}`).expect(404);
        await post(learner, `/courses/${hidden.id}/enroll`).expect(404);
        await get(
          learner,
          `/courses/${hidden.id}/steps/${hidden.steps.one}`,
        ).expect(404);
      }

      expect(
        (await catalog(learner)).items.find((c) => c.id === restrictedMine.id)
          ?.restricted,
      ).toBe(true);

      // The catalog is what one can learn, for managers too: drafts and others' restricted courses live in Manage.
      const managed = (await catalog(author)).items.map((c) => c.id);
      expect(managed).toContain(open.id);
      expect(managed).not.toContain(draft.id);
      expect(managed).not.toContain(restricted.id);
    });

    it("an archived course leaves Required; its learners keep the overview but not the content", async () => {
      const c = await course({ title: "Soon archived" });
      await assign(c.id, { orgNodeId: area });
      await post(learner, `/courses/${c.id}/enroll`).expect(200);
      expect((await learning(learner)).required.map((i) => i.id)).toContain(
        c.id,
      );

      await prisma.course.update({
        where: { id: c.id },
        data: { status: "ARCHIVED" },
      });
      const after = await learning(learner);
      expect(after.required.map((i) => i.id)).not.toContain(c.id);
      expect(after.inProgress.map((i) => i.id)).not.toContain(c.id);
      expect((await overview(learner, c.id)).status).toBe("ARCHIVED");
      await get(learner, `/courses/${c.id}/steps/${c.steps.one}`).expect(404);
      await complete(learner, c.id, c.steps.one).expect(404);
    });

    it("another organization reaches nothing", async () => {
      const c = await course({ title: "Ours" });
      expect((await catalog(outsider)).items.map((i) => i.id)).not.toContain(
        c.id,
      );
      await get(outsider, `/courses/${c.id}`).expect(404);
      await post(outsider, `/courses/${c.id}/enroll`).expect(404);
      await get(outsider, `/courses/${c.id}/steps/${c.steps.one}`).expect(404);
      await complete(outsider, c.id, c.steps.one).expect(404);
      expect(await prisma.enrollment.count({ where: { courseId: c.id } })).toBe(
        0,
      );
    });

    it("a step of another course is not found through this one", async () => {
      const a = await course({ title: "A" });
      const b = await course({ title: "B" });
      await get(learner, `/courses/${a.id}/steps/${b.steps.one}`).expect(404);
      await complete(learner, a.id, b.steps.one).expect(404);
    });
  });

  describe("enrolment", () => {
    it("reading lists and the overview never enrols; Start and opening a step do, once", async () => {
      const c = await course({ title: "Lazy" });
      await assign(c.id, { userId: learner.id });
      await learning(learner);
      await catalog(learner);
      const before = await overview(learner, c.id);
      expect(before.enrollment).toBeNull();
      expect(before.state).toBe("NOT_STARTED");
      expect(await enrollments(learner.id, c.id)).toBe(0);

      await Promise.all([
        post(learner, `/courses/${c.id}/enroll`).expect(200),
        post(learner, `/courses/${c.id}/enroll`).expect(200),
      ]);
      expect(await enrollments(learner.id, c.id)).toBe(1);

      const other = await course({ title: "By opening" });
      await get(learner, `/courses/${other.id}/steps/${other.steps.one}`)
        .expect(200)
        .expect((res) => expect(res.body.completed).toBe(false));
      expect(await enrollments(learner.id, other.id)).toBe(1);
      expect((await overview(learner, other.id)).state).toBe("IN_PROGRESS");
    });

    it("a manager previews any course without writing anything", async () => {
      const draft = await course({
        title: "Preview me",
        status: "DRAFT",
        publishedAt: null,
      });
      await get(author, `/courses/${draft.id}?preview=1`).expect(200);
      await get(
        author,
        `/courses/${draft.id}/steps/${draft.steps.one}?preview=1`,
      ).expect(200);
      expect(
        await prisma.enrollment.count({ where: { courseId: draft.id } }),
      ).toBe(0);
      await get(learner, `/courses/${draft.id}?preview=1`).expect(404);
    });
  });

  describe("completion", () => {
    it("a sequential course cannot be skipped through the API", async () => {
      const c = await course({ title: "In order", sequential: true }, [
        ["one", "extra?"],
        ["two"],
      ]);
      const locked = await get(
        learner,
        `/courses/${c.id}/steps/${c.steps.two}`,
      ).expect(409);
      expect(locked.body).toMatchObject({
        code: "STEP_LOCKED",
        stepId: c.steps.one,
      });
      await complete(learner, c.id, c.steps.two).expect(409);
      expect((await overview(learner, c.id)).sections[1].steps[0].locked).toBe(
        true,
      );

      await complete(learner, c.id, c.steps.one).expect(200);
      // The optional step in between does not block.
      await get(learner, `/courses/${c.id}/steps/${c.steps.two}`).expect(200);
      await complete(learner, c.id, c.steps.two).expect(200);
    });

    it("a free-order course opens any step", async () => {
      const c = await course({ title: "Any order" });
      await complete(learner, c.id, c.steps.two).expect(200);
      const o = await overview(learner, c.id);
      expect(o.progress).toEqual({ done: 1, total: 2 });
      expect(o.nextStepId).toBe(c.steps.one);
    });

    it("completing every required step completes the enrolment once, even with parallel calls", async () => {
      const c = await course({ title: "Finish" }, [["one", "two", "side?"]]);
      await complete(learner, c.id, c.steps.one).expect(200);
      const results = await Promise.all([
        complete(learner, c.id, c.steps.two),
        complete(learner, c.id, c.steps.two),
      ]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const enrollment = await prisma.enrollment.findUniqueOrThrow({
        where: { courseId_userId: { courseId: c.id, userId: learner.id } },
        include: { progress: true },
      });
      expect(enrollment.status).toBe("COMPLETED");
      expect(enrollment.completedAt).not.toBeNull();
      expect(enrollment.progress).toHaveLength(2);

      // Doing it again changes nothing; the optional step can still be done.
      await complete(learner, c.id, c.steps.two).expect(200);
      await complete(learner, c.id, c.steps.side).expect(200);
      const again = await prisma.enrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });
      expect(again.completedAt).toEqual(enrollment.completedAt);
      expect((await overview(learner, c.id)).state).toBe("COMPLETED");
    });

    it("a quiz is completed only by passing it, and no learner route carries its answers", async () => {
      const c = await course({ title: "Quizzed" }, [["one", "quiz"]]);
      await complete(learner, c.id, c.steps.quiz).expect(400);

      const o = await get(learner, `/courses/${c.id}`).expect(200);
      const step = await get(
        learner,
        `/courses/${c.id}/steps/${c.steps.quiz}`,
      ).expect(200);
      for (const body of [o.body, step.body]) {
        const text = JSON.stringify(body);
        expect(text).not.toContain('"correct"');
        expect(text).not.toContain('"questions"');
        expect(text).not.toContain("Pick A");
      }
      expect(step.body.step.content).toMatchObject({
        passScore: 80,
        questionCount: 1,
      });
    });

    it("deleting the last pending step, or making it optional, completes in-progress enrolments", async () => {
      const c = await course({ title: "Edited live" }, [
        ["one", "two", "three"],
      ]);
      await complete(learner, c.id, c.steps.one).expect(200);
      await complete(learner, c.id, c.steps.two).expect(200);

      await http
        .delete(`/api/v1/grow/steps/${c.steps.three}`)
        .set(author.auth)
        .expect(204);
      expect((await overview(learner, c.id)).state).toBe("COMPLETED");

      const d = await course({ title: "Made optional" });
      await complete(learner, d.id, d.steps.one).expect(200);
      await http
        .patch(`/api/v1/grow/steps/${d.steps.two}`)
        .set(author.auth)
        .send({ required: false })
        .expect(200);
      expect((await overview(learner, d.id)).state).toBe("COMPLETED");

      // A new required step never reopens a completed enrolment.
      const section = await prisma.courseSection.findFirstOrThrow({
        where: { courseId: d.id },
      });
      await http
        .post(`/api/v1/grow/sections/${section.id}/steps`)
        .set(author.auth)
        .send({ type: "LESSON", title: "New" })
        .expect(201);
      expect((await overview(learner, d.id)).state).toBe("COMPLETED");
    });
  });

  describe("pending count", () => {
    const pending = async (who: TestActor) =>
      (await get(who, "/learning/pending").expect(200)).body as {
        pending: number;
        overdue: number;
        courses: { id: string; title: string; state: string }[];
      };
    const counts = async (who: TestActor) => {
      const { pending: p, overdue } = await pending(who);
      return { pending: p, overdue };
    };

    it("counts the mandatory courses not completed, and how many are overdue", async () => {
      const lone = await createActor(
        app,
        "le-pending",
        "COLLABORATOR",
        admin.orgId,
      );
      expect(await pending(lone)).toEqual({
        pending: 0,
        overdue: 0,
        courses: [],
      });

      const open = await course({ title: "Pending open" }, [["only"]]);
      const late = await course({ title: "Pending late" });
      const done = await course({ title: "Pending done" }, [["only"]]);
      const optional = await course({ title: "Pending optional" });
      const archived = await course({
        title: "Pending archived",
        status: "ARCHIVED",
      });
      await assign(open.id, { userId: lone.id });
      await assign(late.id, { userId: lone.id, dueAt: new Date("2000-01-01") });
      await assign(done.id, { userId: lone.id });
      await assign(optional.id, { userId: lone.id, mandatory: false });
      await assign(archived.id, { userId: lone.id });
      expect(await counts(lone)).toEqual({ pending: 3, overdue: 1 });

      await complete(lone, done.id, done.steps.only).expect(200);
      const after = await pending(lone);
      expect(after).toMatchObject({ pending: 2, overdue: 1 });
      // Most urgent first; completed, optional and archived courses are not shortcuts.
      expect(after.courses.map((c) => [c.id, c.state])).toEqual([
        [late.id, "OVERDUE"],
        [open.id, "NOT_STARTED"],
      ]);
    });

    it("lists at most five shortcuts while the count stays the total", async () => {
      const busy = await createActor(
        app,
        "le-pending-busy",
        "COLLABORATOR",
        admin.orgId,
      );
      for (let i = 0; i < 6; i++) {
        const c = await course({ title: `Pending many ${i}` });
        await assign(c.id, { userId: busy.id });
      }
      const body = await pending(busy);
      expect(body.pending).toBe(6);
      expect(body.courses).toHaveLength(5);
    });

    it("is per person and per organization", async () => {
      const mate = await createActor(
        app,
        "le-pending-mate",
        "COLLABORATOR",
        admin.orgId,
      );
      const mine = await course({ title: "Only for the learner" });
      await assign(mine.id, { userId: mate.id });
      const before = await pending(learner);
      expect(await pending(mate)).toMatchObject({
        pending: 1,
        courses: [{ id: mine.id, title: "Only for the learner" }],
      });
      expect(await pending(learner)).toEqual(before);
      expect(before.courses.map((c) => c.id)).not.toContain(mine.id);
      expect(await pending(outsider)).toEqual({
        pending: 0,
        overdue: 0,
        courses: [],
      });
    });
  });

  describe("My learning", () => {
    it("lists mandatory courses with their due date, in-progress ones and recommendations", async () => {
      const lone = await createActor(
        app,
        "le-lone",
        "COLLABORATOR",
        admin.orgId,
      );
      await prisma.userProfile.create({
        data: { userId: lone.id, orgNodeId: otherArea },
      });
      const required = await course({ title: "Required one" });
      await assign(required.id, {
        userId: lone.id,
        dueAt: new Date("2000-01-01"),
      });
      const optional = await course({ title: "Optional one" });
      await assign(optional.id, { userId: lone.id, mandatory: false });
      await post(lone, `/courses/${optional.id}/enroll`).expect(200);

      const mine = await learning(lone);
      const item = mine.required.find((i) => i.id === required.id);
      expect(item).toMatchObject({
        mandatory: true,
        dueAt: "2000-01-01",
        state: "OVERDUE",
        progress: { done: 0, total: 2 },
        isNew: true,
      });
      expect(mine.required.map((i) => i.id)).not.toContain(optional.id);
      expect(mine.inProgress.map((i) => i.id)).toContain(optional.id);
      expect(mine.recommended.length).toBeLessThanOrEqual(3);
      for (const r of mine.recommended)
        expect([required.id, optional.id]).not.toContain(r.id);
    });

    it("an area change moves Required and restarts the relative due date on the next request", async () => {
      const mover = await createActor(
        app,
        "le-mover",
        "COLLABORATOR",
        admin.orgId,
      );
      await prisma.userProfile.create({
        data: { userId: mover.id, orgNodeId: area },
      });
      const plant = await course({ title: "Plant safety" });
      await assign(plant.id, {
        orgNodeId: area,
        dueInDays: 10,
        createdAt: new Date(Date.now() - 30 * 86400000),
      });
      const office = await course({ title: "Office safety" });
      await assign(office.id, {
        orgNodeId: otherArea,
        dueInDays: 10,
        createdAt: new Date(Date.now() - 30 * 86400000),
      });

      const before = await learning(mover);
      expect(before.required.find((i) => i.id === plant.id)?.state).toBe(
        "OVERDUE",
      );
      expect(before.required.map((i) => i.id)).not.toContain(office.id);

      await http
        .patch(`/api/v1/org/members/${mover.id}/assignment`)
        .set(admin.auth)
        .send({ orgNodeId: otherArea })
        .expect(200);
      const after = await learning(mover);
      expect(after.required.map((i) => i.id)).not.toContain(plant.id);
      const moved = after.required.find((i) => i.id === office.id);
      // Counted from the move, not from the assignment 30 days ago.
      expect(moved?.state).toBe("NOT_STARTED");
      expect(moved?.isNew).toBe(true);
      expect(moved!.dueAt! > new Date().toISOString().slice(0, 10)).toBe(true);
    });
  });

  describe("catalog", () => {
    it("searches, filters by my state and pages with a cursor", async () => {
      const reader = await createActor(
        app,
        "le-reader",
        "COLLABORATOR",
        admin.orgId,
      );
      const tag = `zq${Date.now()}`;
      const made = [];
      for (const n of [1, 2, 3])
        made.push(await course({ title: `${tag} course ${n}` }));
      await post(reader, `/courses/${made[0].id}/enroll`).expect(200);

      const all = await catalog(reader, `?q=${tag}`);
      expect(all.items).toHaveLength(3);
      expect(
        (await catalog(reader, `?q=${tag}&status=IN_PROGRESS`)).items.map(
          (i) => i.id,
        ),
      ).toEqual([made[0].id]);
      expect(
        (await catalog(reader, `?q=${tag}&status=NOT_STARTED`)).items,
      ).toHaveLength(2);

      const first = await catalog(reader, `?q=${tag}&limit=2`);
      expect(first.items).toHaveLength(2);
      expect(first.nextCursor).not.toBeNull();
      const second = await catalog(
        reader,
        `?q=${tag}&limit=2&cursor=${first.nextCursor}`,
      );
      expect(second.items.map((i) => i.title)).toEqual([`${tag} course 3`]);
      expect(second.nextCursor).toBeNull();
      await get(reader, "/catalog?status=BOGUS").expect(400);
    });
  });
});
