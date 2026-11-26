import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { StorageService } from "../storage/storage.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { sweepOrphanLessonFiles } from "./orphan-lesson-files";

describe("Sweeping orphan lesson files e2e", () => {
  let app: INestApplication;
  let storage: StorageService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let courseId: string;
  let stepId: string;

  const key = (ext: string) =>
    `organizations/${admin.orgId}/grow/${courseId}/${randomUUID()}.${ext}`;
  const put = (k: string) =>
    storage.putObject(k, {
      buffer: Buffer.from("x"),
      size: 1,
      mimetype: "text/plain",
    } as Express.Multer.File);
  const exists = async (k: string) =>
    (await storage.listObjects(k)).some((o) => o.name === k);
  const sweep = (apply: boolean, graceMs?: number) =>
    sweepOrphanLessonFiles(app.get(SystemPrismaService), storage, {
      apply,
      graceMs,
      prefix: `organizations/${admin.orgId}/`,
    });

  beforeAll(async () => {
    app = await createTestApp();
    storage = app.get(StorageService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "olf-admin", "ADMIN");
    courseId = (
      await http
        .post("/api/v1/grow/courses")
        .set(admin.auth)
        .send({ title: "Sweep course" })
        .expect(201)
    ).body.id;
    const section = (
      await http
        .post(`/api/v1/grow/courses/${courseId}/sections`)
        .set(admin.auth)
        .send({ title: "S" })
        .expect(201)
    ).body.id;
    stepId = (
      await http
        .post(`/api/v1/grow/sections/${section}/steps`)
        .set(admin.auth)
        .send({ type: "LESSON", title: "L" })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => app?.close());

  it("finds and deletes only files no step references, and waits for recent ones", async () => {
    const orphan = key("mp4");
    const used = key("pdf");
    await put(orphan);
    await put(used);
    await app.get(SystemPrismaService).courseStep.update({
      where: { id: stepId },
      data: {
        content: {
          kind: "files",
          files: [{ key: used, name: "a.pdf", size: 1 }],
        },
      },
    });

    expect(await sweep(false)).not.toContain(orphan); // too recent: the lesson may not be saved yet
    const found = await sweep(false, 0);
    expect(found).toContain(orphan);
    expect(found).not.toContain(used);
    expect(await exists(orphan)).toBe(true); // a dry run deletes nothing

    await sweep(true, 0);
    expect(await exists(orphan)).toBe(false);
    expect(await exists(used)).toBe(true);
  });

  it("keeps the video a lesson holds and leaves other prefixes alone", async () => {
    const video = key("mp4");
    const elsewhere = `organizations/${admin.orgId}/uploads/${randomUUID()}.png`;
    await put(video);
    await put(elsewhere);
    await app.get(SystemPrismaService).courseStep.update({
      where: { id: stepId },
      data: {
        content: {
          kind: "video",
          video: { key: video, name: "v.mp4", size: 1 },
        },
      },
    });

    const found = await sweep(false, 0);
    expect(found).not.toContain(video);
    expect(found).not.toContain(elsewhere);
  });
});
