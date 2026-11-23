import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { EMPTY_QUIZ } from "./quiz-content";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n%lesson\n");
const doc = (...nodes: object[]) => ({
  type: "doc",
  content: nodes.length ? nodes : [{ type: "paragraph" }],
});
const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});
const image = (src: string) => ({ type: "image", attrs: { src } });
const question = {
  id: "q1",
  type: "single",
  prompt: "Which extinguisher for electrical fires?",
  points: 1,
  options: [
    { id: "a", text: "CO2" },
    { id: "b", text: "Water" },
  ],
  correct: ["a"],
};

describe("GROW course content e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let admin: TestActor;
  let author: TestActor;
  let member: TestActor;

  const call = (
    who: TestActor,
    method: "get" | "post" | "patch" | "delete",
    path: string,
    body?: object,
  ) => {
    const req = http[method](`/api/v1/grow${path}`).set(who.auth);
    return body ? req.send(body) : req;
  };
  const newCourse = async () =>
    (await call(author, "post", "/courses", { title: "Content" }).expect(201))
      .body.id as string;
  const addSection = async (courseId: string, title: string) =>
    (
      await call(author, "post", `/courses/${courseId}/sections`, {
        title,
      }).expect(201)
    ).body.id as string;
  const addStep = async (sectionId: string, title: string, type = "LESSON") =>
    (
      await call(author, "post", `/sections/${sectionId}/steps`, {
        type,
        title,
      }).expect(201)
    ).body.id as string;
  const outline = async (courseId: string) =>
    (await call(author, "get", `/courses/${courseId}/edit`).expect(200)).body
      .sections as {
      id: string;
      title: string;
      position: number;
      steps: {
        id: string;
        title: string;
        position: number;
        content: unknown;
      }[];
    }[];
  const upload = (
    courseId: string,
    file: Buffer,
    filename: string,
    contentType: string,
    who = author,
  ) =>
    http
      .post(`/api/v1/grow/courses/${courseId}/files`)
      .set(who.auth)
      .attach("file", file, { filename, contentType });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    admin = await createActor(app, "cc-admin", "ADMIN");
    author = await createActor(app, "cc-author", "COLLABORATOR", admin.orgId);
    member = await createActor(app, "cc-member", "COLLABORATOR", admin.orgId);
    await prisma.userCapability.create({
      data: {
        userId: author.id,
        capability: "GROW_COURSE_MANAGE",
        grantedById: admin.id,
      },
    });
  });

  afterAll(async () => app?.close());

  describe("outline", () => {
    it("appends sections and steps, renames them and renumbers after deletes", async () => {
      const id = await newCourse();
      const [a, b, c] = [
        await addSection(id, "A"),
        await addSection(id, "B"),
        await addSection(id, "C"),
      ];
      await call(author, "patch", `/sections/${b}`, { title: "B2" }).expect(
        200,
      );
      await call(author, "delete", `/sections/${a}`).expect(204);
      expect((await outline(id)).map((s) => [s.title, s.position])).toEqual([
        ["B2", 0],
        ["C", 1],
      ]);
      const [x, y, z] = [
        await addStep(c, "x"),
        await addStep(c, "y"),
        await addStep(c, "z"),
      ];
      await call(author, "delete", `/steps/${y}`).expect(204);
      expect(
        (await outline(id))[1].steps.map((s) => [s.id, s.position]),
      ).toEqual([
        [x, 0],
        [z, 1],
      ]);
      await call(author, "post", `/courses/${id}/sections`, {
        title: "",
      }).expect(400);
      await call(author, "post", `/sections/${b}/steps`, {
        type: "VIDEO",
        title: "x",
      }).expect(400);
    });

    it("moves steps within and across sections and moves sections", async () => {
      const id = await newCourse();
      const [s1, s2] = [
        await addSection(id, "One"),
        await addSection(id, "Two"),
      ];
      const [a, b, c] = [
        await addStep(s1, "a"),
        await addStep(s1, "b"),
        await addStep(s1, "c"),
      ];
      const d = await addStep(s2, "d");

      let sections = (
        await call(author, "patch", `/steps/${c}/move`, {
          sectionId: s1,
          position: 0,
        }).expect(200)
      ).body.sections;
      expect(sections[0].steps.map((s: { title: string }) => s.title)).toEqual([
        "c",
        "a",
        "b",
      ]);

      sections = (
        await call(author, "patch", `/steps/${a}/move`, {
          sectionId: s2,
          position: 1,
        }).expect(200)
      ).body.sections;
      expect(
        sections[0].steps.map((s: { title: string; position: number }) => [
          s.title,
          s.position,
        ]),
      ).toEqual([
        ["c", 0],
        ["b", 1],
      ]);
      expect(
        sections[1].steps.map((s: { title: string; position: number }) => [
          s.title,
          s.position,
        ]),
      ).toEqual([
        ["d", 0],
        ["a", 1],
      ]);
      expect(
        (await prisma.courseStep.findUniqueOrThrow({ where: { id: a } }))
          .sectionId,
      ).toBe(s2);

      sections = (
        await call(author, "patch", `/sections/${s2}/move`, {
          position: 0,
        }).expect(200)
      ).body.sections;
      expect(sections.map((s: { title: string }) => s.title)).toEqual([
        "Two",
        "One",
      ]);

      // positions past the end are clamped; another course's section is not a target
      await call(author, "patch", `/steps/${b}/move`, {
        sectionId: s2,
        position: 99,
      }).expect(200);
      const other = await addSection(await newCourse(), "Elsewhere");
      await call(author, "patch", `/steps/${d}/move`, {
        sectionId: other,
        position: 0,
      }).expect(400);
    });
  });

  describe("lesson and quiz content", () => {
    let course: string;
    let section: string;
    beforeAll(async () => {
      course = await newCourse();
      section = await addSection(course, "S");
    });

    it("a new lesson is empty text; text, link and files content are validated", async () => {
      const lesson = await addStep(section, "Lesson");
      expect(
        (await prisma.courseStep.findUniqueOrThrow({ where: { id: lesson } }))
          .content,
      ).toEqual({
        kind: "text",
        doc: doc(),
      });
      await call(author, "patch", `/steps/${lesson}`, {
        content: { kind: "text", doc: doc(paragraph("Hello")) },
      }).expect(200);
      await call(author, "patch", `/steps/${lesson}`, {
        content: {
          kind: "text",
          doc: doc(image(`organizations/${member.orgId}x/uploads/a.png`)),
        },
      }).expect(400);
      await call(author, "patch", `/steps/${lesson}`, {
        content: { kind: "link", url: "https://evil.example/v" },
      }).expect(400);
      await call(author, "patch", `/steps/${lesson}`, {
        content: { kind: "link", url: "https://youtu.be/dQw4w9WgXcQ" },
      }).expect(200);
      const foreignKey = `organizations/${admin.orgId}/grow/00000000-0000-0000-0000-000000000000/a.pdf`;
      await call(author, "patch", `/steps/${lesson}`, {
        content: {
          kind: "files",
          files: [{ key: foreignKey, name: "a.pdf", size: 1 }],
        },
      }).expect(400);
      await call(author, "patch", `/steps/${lesson}`, {
        durationMinutes: 0,
      }).expect(400);
      const res = await call(author, "patch", `/steps/${lesson}`, {
        title: "Renamed",
        durationMinutes: 8,
        required: false,
      }).expect(200);
      expect(res.body).toMatchObject({
        title: "Renamed",
        durationMinutes: 8,
        required: false,
      });
    });

    it("a new quiz has the defaults; its questions and answer key are validated and kept for authors", async () => {
      const quiz = await addStep(section, "Quiz", "QUIZ");
      await call(author, "patch", `/steps/${quiz}`, {
        content: { ...EMPTY_QUIZ, questions: [{ ...question, correct: [] }] },
      }).expect(400);
      await call(author, "patch", `/steps/${quiz}`, {
        content: { ...EMPTY_QUIZ, passScore: 150 },
      }).expect(400);
      await call(author, "patch", `/steps/${quiz}`, {
        content: { ...EMPTY_QUIZ, questions: [question] },
      }).expect(200);
      const step = (await outline(course))[0].steps.find((s) => s.id === quiz);
      expect(step?.content).toMatchObject({ questions: [{ correct: ["a"] }] });
    });

    it("accepts step content up to 1 MB", async () => {
      const lesson = await addStep(section, "Long");
      const long = doc(
        ...Array.from({ length: 300 }, () => paragraph("x".repeat(2000))),
      );
      await call(author, "patch", `/steps/${lesson}`, {
        content: { kind: "text", doc: long },
      }).expect(200);
      const tooLong = doc(
        ...Array.from({ length: 600 }, () => paragraph("x".repeat(2000))),
      );
      await call(author, "patch", `/steps/${lesson}`, {
        content: { kind: "text", doc: tooLong },
      }).expect(413);
    });

    it("members cannot edit content: 404 on drafts", async () => {
      const lesson = await addStep(section, "Guarded");
      await call(member, "patch", `/steps/${lesson}`, { title: "x" }).expect(
        404,
      );
      await call(member, "post", `/sections/${section}/steps`, {
        type: "LESSON",
        title: "x",
      }).expect(404);
      await call(member, "delete", `/sections/${section}`).expect(404);
    });
  });

  describe("lesson files", () => {
    it("stores documents under the course's prefix and rejects unknown types, fakes and oversize files", async () => {
      const id = await newCourse();
      const res = await upload(id, PDF, "Guide.pdf", "application/pdf").expect(
        201,
      );
      expect(res.body.key).toMatch(
        new RegExp(`^organizations/${admin.orgId}/grow/${id}/[\\w-]+\\.pdf$`),
      );
      expect(res.body).toMatchObject({ name: "Guide.pdf", size: PDF.length });
      await http
        .get(`/api/v1/files/${res.body.key}`)
        .set(author.auth)
        .expect(200);

      // Lessons share KNOW's catalog: images are files too, executables are not.
      await upload(id, PNG, "x.png", "image/png").expect(201);
      await upload(
        id,
        Buffer.from("MZ\0\0"),
        "run.exe",
        "application/x-msdownload",
      ).expect(400);
      await upload(
        id,
        Buffer.from("<html>"),
        "x.pdf",
        "application/pdf",
      ).expect(400);
      await upload(
        id,
        Buffer.alloc(50 * 1024 * 1024 + 1, 0x25),
        "big.pdf",
        "application/pdf",
      ).expect(413);
      await upload(id, PDF, "a.pdf", "application/pdf", member).expect(404);

      const section = await addSection(id, "Files");
      const lesson = await addStep(section, "Handouts");
      await call(author, "patch", `/steps/${lesson}`, {
        content: {
          kind: "files",
          files: [{ key: res.body.key, name: "Guide.pdf", size: PDF.length }],
        },
      }).expect(200);
    });
  });

  describe("deleting a draft removes its media", () => {
    it("removes uploaded files and lesson images no other course uses", async () => {
      const id = await newCourse();
      const file = (
        await upload(id, PDF, "a.pdf", "application/pdf").expect(201)
      ).body.key as string;
      const mine = (
        await http
          .post("/api/v1/files/images")
          .set(author.auth)
          .attach("file", PNG, { filename: "a.png", contentType: "image/png" })
          .expect(201)
      ).body.key as string;
      const shared = (
        await http
          .post("/api/v1/files/images")
          .set(author.auth)
          .attach("file", PNG, { filename: "b.png", contentType: "image/png" })
          .expect(201)
      ).body.key as string;

      const lesson = await addStep(await addSection(id, "S"), "Pictures");
      await call(author, "patch", `/steps/${lesson}`, {
        content: { kind: "text", doc: doc(image(mine), image(shared)) },
      }).expect(200);
      const other = await newCourse();
      const otherLesson = await addStep(await addSection(other, "S"), "Reuses");
      await call(author, "patch", `/steps/${otherLesson}`, {
        content: { kind: "text", doc: doc(image(shared)) },
      }).expect(200);

      await call(author, "delete", `/courses/${id}`).expect(204);
      await http.get(`/api/v1/files/${file}`).set(author.auth).expect(404);
      await http.get(`/api/v1/files/${mine}`).set(author.auth).expect(404);
      await http.get(`/api/v1/files/${shared}`).set(author.auth).expect(200);
    });
  });
});
