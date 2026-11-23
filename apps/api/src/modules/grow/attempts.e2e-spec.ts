import { INestApplication } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

/** Quizzes: attempts, grading, review of written answers and what a learner may see of the answer key. */
describe("GROW quiz attempts e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let author: TestActor;
  let learner: TestActor;
  let other: TestActor;
  let outsider: TestActor;

  type Shown = {
    id: string;
    status: string;
    score: number | null;
    passed: boolean | null;
    questions: {
      id: string;
      options?: { id: string }[];
      result: { correct: boolean | null } | null;
      correctOptions: string[] | null;
    }[];
  };

  const choice = (id: string, correct = "a") => ({
    id,
    type: "single",
    prompt: `Question ${id}`,
    points: 1,
    options: [
      { id: "a", text: "Option A" },
      { id: "b", text: "Option B" },
    ],
    correct: [correct],
  });
  const open = (id: string) => ({
    id,
    type: "open",
    prompt: `Explain ${id}`,
    points: 2,
    guidance: "SECRET-GUIDANCE",
  });
  const quizContent = (
    questions: object[],
    patch: Partial<{
      passScore: number;
      bankSize: number | null;
      showCorrectAnswers: boolean;
    }> = {},
  ) => ({
    passScore: 50,
    bankSize: null,
    shuffle: false,
    showCorrectAnswers: true,
    questions,
    ...patch,
  });

  /** A published course: optional lesson first, then the quiz; `sequential` puts a required lesson before it. */
  const course = async (quiz: object, opts: { sequential?: boolean } = {}) => {
    const c = await prisma.course.create({
      data: {
        organizationId: admin.orgId,
        title: "Quiz course",
        createdById: admin.id,
        status: "PUBLISHED",
        publishedAt: new Date(),
        sequential: !!opts.sequential,
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
        title: "Read first",
        position: 0,
        required: !!opts.sequential,
        content: {
          kind: "text",
          doc: { type: "doc", content: [{ type: "paragraph" }] },
        },
      },
    });
    const quizStep = await prisma.courseStep.create({
      data: {
        courseId: c.id,
        sectionId: section.id,
        type: "QUIZ",
        title: "Check",
        position: 1,
        content: quiz as Prisma.InputJsonValue,
      },
    });
    return { id: c.id, lesson: lesson.id, quiz: quizStep.id };
  };
  const start = (who: TestActor, c: { id: string; quiz: string }) =>
    http
      .post(`/api/v1/grow/courses/${c.id}/steps/${c.quiz}/attempts`)
      .set(who.auth);
  const submit = (who: TestActor, attemptId: string, answers: object) =>
    http
      .post(`/api/v1/grow/attempts/${attemptId}/submit`)
      .set(who.auth)
      .send({ answers });
  const read = (who: TestActor, attemptId: string) =>
    http.get(`/api/v1/grow/attempts/${attemptId}`).set(who.auth);
  const noKey = (body: unknown) => {
    const text = JSON.stringify(body);
    expect(text).not.toContain('"correct":[');
    expect(text).not.toContain("SECRET-GUIDANCE");
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "qa-admin", "ADMIN");
    author = await createActor(app, "qa-author", "COLLABORATOR", admin.orgId);
    learner = await createActor(app, "qa-learner", "COLLABORATOR", admin.orgId);
    other = await createActor(app, "qa-other", "COLLABORATOR", admin.orgId);
    outsider = await createActor(app, "qa-out", "ADMIN");
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
  });

  afterAll(async () => app?.close());

  it("starts once and resumes the attempt in progress, even with parallel starts", async () => {
    const c = await course(quizContent([choice("q1"), choice("q2")]));
    const [a, b] = await Promise.all([start(learner, c), start(learner, c)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    expect((await start(learner, c).expect(201)).body.id).toBe(a.body.id);
    const overview = await http
      .get(`/api/v1/grow/courses/${c.id}`)
      .set(learner.auth)
      .expect(200);
    expect(overview.body.sections[0].steps[1].quiz).toMatchObject({
      inProgress: true,
      attempts: 0,
    });
    expect(await prisma.quizAttempt.count({ where: { stepId: c.quiz } })).toBe(
      1,
    );
    noKey(a.body);
    expect(a.body.questions[0].options).toHaveLength(2);
  });

  it("grades choice questions, completes the step on a pass and allows unlimited retries", async () => {
    const c = await course(quizContent([choice("q1"), choice("q2")]));
    const first = (await start(learner, c).expect(201)).body as Shown;
    const failed = (
      await submit(learner, first.id, { q1: ["b"], q2: ["b"] }).expect(200)
    ).body as Shown;
    expect(failed).toMatchObject({ status: "GRADED", score: 0, passed: false });
    // Not passed yet: which were wrong, never the right options.
    expect(failed.questions.map((q) => q.result?.correct)).toEqual([
      false,
      false,
    ]);
    noKey(failed);
    expect(failed.questions.every((q) => q.correctOptions === null)).toBe(true);

    const second = (await start(learner, c).expect(201)).body as Shown;
    expect(second.id).not.toBe(first.id);
    const passed = (
      await submit(learner, second.id, { q1: ["a"], q2: ["b"] }).expect(200)
    ).body as Shown;
    expect(passed).toMatchObject({ score: 50, passed: true });
    // Passed and the quiz shows answers: the right options come with the result.
    expect(passed.questions[1].correctOptions).toEqual(["a"]);

    const overview = await http
      .get(`/api/v1/grow/courses/${c.id}`)
      .set(learner.auth)
      .expect(200);
    const quizStep = overview.body.sections[0].steps[1];
    expect(quizStep).toMatchObject({
      completed: true,
      quiz: {
        best: 50,
        attempts: 2,
        pendingReview: false,
        lastAttemptId: second.id,
      },
    });
    // The first, failed attempt now reveals its key too.
    expect(
      (await read(learner, first.id).expect(200)).body.questions[0]
        .correctOptions,
    ).toEqual(["a"]);
  });

  it("keeps the key hidden after a pass when the quiz does not show answers", async () => {
    const c = await course(
      quizContent([choice("q1")], { showCorrectAnswers: false }),
    );
    const a = (await start(learner, c).expect(201)).body as Shown;
    const done = (await submit(learner, a.id, { q1: ["a"] }).expect(200))
      .body as Shown;
    expect(done.passed).toBe(true);
    noKey(done);
    noKey((await read(learner, a.id).expect(200)).body);
  });

  it("submits once under parallel calls and rejects answers outside the attempt", async () => {
    const c = await course(quizContent([choice("q1")]));
    const a = (await start(learner, c).expect(201)).body as Shown;
    await submit(learner, a.id, { zz: ["a"] }).expect(400);
    await submit(learner, a.id, { q1: ["nope"] }).expect(400);
    const results = await Promise.all([
      submit(learner, a.id, { q1: ["a"] }),
      submit(learner, a.id, { q1: ["b"] }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    // Both calls report the one stored result.
    expect(results[0].body.score).toBe(results[1].body.score);
    const stored = await prisma.quizAttempt.findUniqueOrThrow({
      where: { id: a.id },
    });
    expect(stored.score).toBe(results[0].body.score);
  });

  it("written answers wait for review: no new attempt meanwhile, managers are told, the grade completes the step", async () => {
    const c = await course(quizContent([choice("q1"), open("w1")]));
    const a = (await start(learner, c).expect(201)).body as Shown;
    const pending = (
      await submit(learner, a.id, {
        q1: ["a"],
        w1: "Because of the risk",
      }).expect(200)
    ).body as Shown;
    expect(pending).toMatchObject({ status: "PENDING_REVIEW", score: null });
    noKey(pending);

    const blocked = await start(learner, c).expect(409);
    expect(blocked.body.code).toBe("ATTEMPT_PENDING_REVIEW");
    expect(
      await prisma.notification.count({
        where: {
          userId: author.id,
          type: "grow:quiz:review",
          link: `/grow/courses/${c.id}/reviews`,
        },
      }),
    ).toBe(1);

    // The review queue: the learner's answer and the guidance.
    await http
      .get(`/api/v1/grow/courses/${c.id}/reviews`)
      .set(learner.auth)
      .expect(403);
    const queue = await http
      .get(`/api/v1/grow/courses/${c.id}/reviews`)
      .set(author.auth)
      .expect(200);
    expect(queue.body).toHaveLength(1);
    expect(queue.body[0]).toMatchObject({
      id: a.id,
      learner: { id: learner.id },
      stepTitle: "Check",
    });
    expect(JSON.stringify(queue.body)).toContain("SECRET-GUIDANCE");

    const grade = (scores: object) =>
      http
        .patch(`/api/v1/grow/attempts/${a.id}/grade`)
        .set(author.auth)
        .send({ scores });
    await grade({}).expect(400);
    await grade({ w1: 3 }).expect(400);
    await grade({ w1: 1, q1: 1 }).expect(400);
    await http
      .patch(`/api/v1/grow/attempts/${a.id}/grade`)
      .set(learner.auth)
      .send({ scores: { w1: 2 } })
      .expect(403);
    const graded = (await grade({ w1: 2 }).expect(200)).body;
    expect(graded).toMatchObject({
      status: "GRADED",
      score: 100,
      passed: true,
    });
    await grade({ w1: 0 }).expect(409);

    expect(
      await prisma.auditLog.count({
        where: { action: "QuizAttempt.GRADE", entityId: a.id },
      }),
    ).toBe(1);
    expect(
      await prisma.notification.count({
        where: { userId: learner.id, type: "grow:quiz:graded" },
      }),
    ).toBeGreaterThanOrEqual(1);
    const enrollment = await prisma.enrollment.findUniqueOrThrow({
      where: { courseId_userId: { courseId: c.id, userId: learner.id } },
      include: { progress: true },
    });
    expect(enrollment.progress.map((p) => p.stepId)).toContain(c.quiz);
    expect((await read(learner, a.id).expect(200)).body.score).toBe(100);
  });

  it("an attempt keeps the questions it started with when the quiz is edited", async () => {
    const c = await course(quizContent([choice("q1")]));
    const a = (await start(learner, c).expect(201)).body as Shown;
    await prisma.courseStep.update({
      where: { id: c.quiz },
      data: {
        content: quizContent([choice("q9", "b")]) as Prisma.InputJsonValue,
      },
    });
    const done = (await submit(learner, a.id, { q1: ["a"] }).expect(200))
      .body as Shown;
    expect(done).toMatchObject({ passed: true });
    expect(done.questions.map((q) => q.id)).toEqual(["q1"]);
    const next = (await start(learner, c).expect(201)).body as Shown;
    expect(next.questions.map((q) => q.id)).toEqual(["q9"]);
  });

  it("draws bankSize questions per attempt", async () => {
    const c = await course(
      quizContent([choice("q1"), choice("q2"), choice("q3")], { bankSize: 2 }),
    );
    const a = (await start(learner, c).expect(201)).body as Shown;
    expect(a.questions).toHaveLength(2);
  });

  it("respects the sequential order, refuses lessons and empty quizzes", async () => {
    const c = await course(quizContent([choice("q1")]), { sequential: true });
    const locked = await start(learner, c).expect(409);
    expect(locked.body.code).toBe("STEP_LOCKED");
    await http
      .post(`/api/v1/grow/courses/${c.id}/steps/${c.lesson}/attempts`)
      .set(learner.auth)
      .expect(400);
    const empty = await course(quizContent([]));
    expect((await start(learner, empty).expect(409)).body.code).toBe(
      "QUIZ_EMPTY",
    );
  });

  it("nobody else reads, submits or grades a learner's attempt; other organizations reach nothing", async () => {
    const c = await course(quizContent([choice("q1"), open("w1")]));
    const a = (await start(learner, c).expect(201)).body as Shown;
    await read(other, a.id).expect(404);
    await read(author, a.id).expect(404);
    await submit(other, a.id, { q1: ["a"] }).expect(404);
    await read(outsider, a.id).expect(404);
    await submit(outsider, a.id, { q1: ["a"] }).expect(404);
    await start(outsider, c).expect(404);
    await http
      .get(`/api/v1/grow/courses/${c.id}/reviews`)
      .set(outsider.auth)
      .expect(404);
    await submit(learner, a.id, { w1: "text" }).expect(200);
    await http
      .patch(`/api/v1/grow/attempts/${a.id}/grade`)
      .set(outsider.auth)
      .send({ scores: { w1: 2 } })
      .expect(404);
    expect(
      (await prisma.quizAttempt.findUniqueOrThrow({ where: { id: a.id } }))
        .status,
    ).toBe("PENDING_REVIEW");
  });

  it("lists pending reviews per course in Manage", async () => {
    const c = await course(quizContent([open("w1")]));
    const a = (await start(other, c).expect(201)).body as Shown;
    await submit(other, a.id, { w1: "text" }).expect(200);
    const list = (
      await http.get("/api/v1/grow/manage/courses").set(author.auth).expect(200)
    ).body.items as { id: string; pendingReviews: number }[];
    expect(list.find((x) => x.id === c.id)?.pendingReviews).toBe(1);
  });
});
