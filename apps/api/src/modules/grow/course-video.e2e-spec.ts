import { INestApplication } from "@nestjs/common";
import { request as rawRequest } from "http";
import type { AddressInfo } from "net";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { StorageService } from "../storage/storage.service";
import { MAX_CONCURRENT_UPLOADS, UploadGate } from "../storage/upload-gate";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

/** An MP4 as the content check sees it: a leading `ftyp` box, then data. */
const mp4 = (fill: number, brand = "isom") =>
  Buffer.concat([
    Buffer.from([0, 0, 0, 20]),
    Buffer.from(`ftyp${brand}\0\0\0\0${brand}`),
    Buffer.alloc(64 * 1024, fill),
  ]);

type VideoContent = {
  kind: "video";
  video: { key: string; name: string; size: number };
};

describe("GROW lesson videos e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let storage: StorageService;
  let http: ReturnType<typeof request>;
  let port: number;
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
  const putVideo = (
    stepId: string,
    file: Buffer,
    name = "Intro clip.mp4",
    type = "video/mp4",
    who = author,
  ) =>
    http
      .put(
        `/api/v1/grow/steps/${stepId}/video?name=${encodeURIComponent(name)}`,
      )
      .set(who.auth)
      .set("Content-Type", type)
      .send(file);
  /**
   * Headers supertest would not send (a huge length, or none at all, i.e. chunked), without a body:
   * the API must answer from the headers alone, before reading anything.
   */
  const headersOnly = (path: string, headers: Record<string, string>) =>
    new Promise<{ status: number; body: { code?: string } }>(
      (resolve, reject) => {
        const req = rawRequest(
          { port, path, method: "PUT", headers },
          (res) => {
            let text = "";
            res.on("data", (c) => (text += c));
            res.on("end", () => {
              req.destroy();
              resolve({ status: res.statusCode!, body: JSON.parse(text) });
            });
          },
        );
        req.on("error", reject);
        req.flushHeaders();
      },
    );
  const lessonIn = async (courseId: string) => {
    const section = (
      await call(author, "post", `/courses/${courseId}/sections`, {
        title: "Videos",
      }).expect(201)
    ).body.id as string;
    const step = (
      await call(author, "post", `/sections/${section}/steps`, {
        type: "LESSON",
        title: "Watch",
      }).expect(201)
    ).body.id as string;
    return { section, step };
  };
  const newCourse = async () =>
    (
      await call(author, "post", "/courses", { title: "Video course" }).expect(
        201,
      )
    ).body.id as string;
  const stored = async (courseId: string) =>
    (
      await storage.listObjects(
        `organizations/${admin.orgId}/grow/${courseId}/`,
      )
    ).map((o) => o.name);

  beforeAll(async () => {
    app = await createTestApp();
    await app.listen(0);
    port = (app.getHttpServer().address() as AddressInfo).port;
    prisma = app.get(SystemPrismaService);
    storage = app.get(StorageService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "cv-admin", "ADMIN");
    author = await createActor(app, "cv-author", "COLLABORATOR", admin.orgId);
    member = await createActor(app, "cv-member", "COLLABORATOR", admin.orgId);
    outsider = await createActor(app, "cv-outsider", "ADMIN");
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
  });

  afterAll(async () => app?.close());

  it("an author uploads a lesson's video; learners play it with byte ranges", async () => {
    const courseId = await newCourse();
    const { step } = await lessonIn(courseId);
    const file = mp4(1);

    const res = await putVideo(step, file).expect(200);
    const content = res.body.content as VideoContent;
    expect(content.kind).toBe("video");
    expect(content.video).toEqual({
      key: expect.stringMatching(
        new RegExp(
          `^organizations/${admin.orgId}/grow/${courseId}/[\\w-]+\\.mp4$`,
        ),
      ),
      name: "Intro clip.mp4",
      size: file.length,
    });
    expect(await stored(courseId)).toEqual([content.video.key]);

    await prisma.course.update({
      where: { id: courseId },
      data: { status: "PUBLISHED", publishedAt: new Date() },
    });
    await call(member, "post", `/courses/${courseId}/enroll`).expect(200);
    const learner = await call(
      member,
      "get",
      `/courses/${courseId}/steps/${step}`,
    ).expect(200);
    expect(learner.body.step.content).toEqual(content);

    const part = await http
      .get(`/api/v1/files/${content.video.key}`)
      .set(member.auth)
      .set("Range", "bytes=0-19")
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => cb(null, Buffer.concat(chunks)));
      })
      .expect(206);
    expect(Buffer.compare(part.body as Buffer, file.subarray(0, 20))).toBe(0);
    expect(part.headers["content-type"]).toBe("video/mp4");
    expect(part.headers["content-security-policy"]).toContain(
      "media-src 'self'",
    );
    await http
      .get(`/api/v1/files/${content.video.key}`)
      .set(outsider.auth)
      .set("Range", "bytes=0-19")
      .expect(404);
  });

  it("a replaced video, a lesson switched to another kind, a deleted step or section leave no file behind", async () => {
    const courseId = await newCourse();
    const { section, step } = await lessonIn(courseId);

    const first = (await putVideo(step, mp4(1)).expect(200)).body
      .content as VideoContent;
    const second = (await putVideo(step, mp4(2), "Take 2.mp4").expect(200)).body
      .content as VideoContent;
    expect(await stored(courseId)).toEqual([second.video.key]);
    await http
      .get(`/api/v1/files/${first.video.key}`)
      .set(author.auth)
      .expect(404);

    // Saving the same video again keeps it; pointing the lesson at another key is refused.
    await call(author, "patch", `/steps/${step}`, { content: second }).expect(
      200,
    );
    await call(author, "patch", `/steps/${step}`, {
      content: {
        kind: "video",
        video: { ...second.video, key: first.video.key },
      },
    }).expect(400);
    expect(await stored(courseId)).toEqual([second.video.key]);

    await call(author, "patch", `/steps/${step}`, {
      content: { kind: "files", files: [] },
    }).expect(200);
    expect(await stored(courseId)).toEqual([]);

    await putVideo(step, mp4(3)).expect(200);
    await call(author, "delete", `/steps/${step}`).expect(204);
    expect(await stored(courseId)).toEqual([]);

    const other = await lessonIn(courseId);
    await putVideo(other.step, mp4(4)).expect(200);
    await call(author, "delete", `/sections/${other.section}`).expect(204);
    await call(author, "delete", `/sections/${section}`).expect(204);
    expect(await stored(courseId)).toEqual([]);
  });

  it("refuses other types, fakes, oversize or unsized uploads, quizzes and people who cannot manage the course", async () => {
    const courseId = await newCourse();
    const { section, step } = await lessonIn(courseId);
    const path = `/api/v1/grow/steps/${step}/video?name=clip.mp4`;

    const quicktime = await putVideo(step, mp4(1, "qt  "), "clip.mp4").expect(
      400,
    );
    expect(quicktime.body.code).toBe("VIDEO_TYPE_UNSUPPORTED");
    await putVideo(
      step,
      Buffer.from("<html>not a video</html>"),
      "clip.mp4",
    ).expect(400);
    await putVideo(
      step,
      Buffer.from("%PDF-1.4\n"),
      "notes.pdf",
      "application/pdf",
    ).expect(400);

    // The size is checked before a single byte is read.
    const huge = await headersOnly(path, {
      ...author.auth,
      "Content-Type": "video/mp4",
      "Content-Length": String(1024 ** 3 + 1),
    });
    expect(huge).toMatchObject({
      status: 413,
      body: { code: "VIDEO_TOO_LARGE" },
    });
    const unsized = await headersOnly(path, {
      ...author.auth,
      "Content-Type": "video/mp4",
      "Transfer-Encoding": "chunked",
    });
    expect(unsized).toMatchObject({
      status: 411,
      body: { code: "FILE_LENGTH_REQUIRED" },
    });

    const quiz = (
      await call(author, "post", `/sections/${section}/steps`, {
        type: "QUIZ",
        title: "Check",
      }).expect(201)
    ).body.id as string;
    const notLesson = await putVideo(quiz, mp4(1)).expect(400);
    expect(notLesson.body.code).toBe("STEP_NOT_LESSON");

    await putVideo(step, mp4(1), "clip.mp4", "video/mp4", member).expect(404);
    await putVideo(step, mp4(1), "clip.mp4", "video/mp4", outsider).expect(404);

    // Pointing a lesson at a video is only done by uploading it.
    await call(author, "patch", `/steps/${step}`, {
      content: {
        kind: "video",
        video: {
          key: `organizations/${admin.orgId}/grow/${courseId}/x.mp4`,
          name: "x.mp4",
          size: 1,
        },
      },
    }).expect(400);
    expect(await stored(courseId)).toEqual([]);
  });
  describe("room for uploads", () => {
    afterEach(() => {
      delete (app.get(UploadGate) as Partial<UploadGate>).readFreeBytes;
    });

    // A PUT announcing a body that never comes: it keeps its slot until destroyed.
    const hold = (stepId: string) =>
      rawRequest({
        port,
        path: `/api/v1/grow/steps/${stepId}/video?name=held.mp4`,
        method: "PUT",
        headers: {
          Authorization: author.auth.Authorization,
          "Content-Type": "video/mp4",
          "Content-Length": String(10 * 1024 * 1024),
        },
      });
    const waitForActive = async (count: number) => {
      const gate = app.get(UploadGate) as unknown as {
        active: { video: number };
      };
      for (let i = 0; i < 100 && gate.active.video !== count; i++)
        await new Promise((r) => setTimeout(r, 50));
      expect(gate.active.video).toBe(count);
    };

    it("answers busy to the upload after the limit, and takes it once one ends", async () => {
      const courseId = await newCourse();
      const { step } = await lessonIn(courseId);
      const held = Array.from({ length: MAX_CONCURRENT_UPLOADS }, () => {
        const req = hold(step);
        req.on("error", () => undefined);
        req.flushHeaders();
        return req;
      });
      await waitForActive(MAX_CONCURRENT_UPLOADS);

      const busy = await putVideo(step, mp4(1)).expect(503);
      expect(busy.body.code).toBe("UPLOAD_BUSY");
      expect(await stored(courseId)).toEqual([]);

      held[0].destroy();
      await waitForActive(MAX_CONCURRENT_UPLOADS - 1);
      await putVideo(step, mp4(2)).expect(200);

      held.slice(1).forEach((req) => req.destroy());
      await waitForActive(0);
    });

    it("answers 507 when the temp folder has no room for the file, and keeps nothing", async () => {
      const courseId = await newCourse();
      const { step } = await lessonIn(courseId);
      app.get(UploadGate).readFreeBytes = async () => 1024;

      const res = await putVideo(step, mp4(1)).expect(507);
      expect(res.body.code).toBe("UPLOAD_NO_SPACE");
      expect(await stored(courseId)).toEqual([]);
      await waitForActive(0);
    });
  });
});
