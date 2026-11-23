import { INestApplication } from "@nestjs/common";
import { mkdtemp, readdir, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import request from "supertest";
import { UploadGate } from "../storage/upload-gate";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, TestActor } from "../../test-helpers";

const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n`);
const binary = (
  res: request.Response,
  cb: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

describe("Documents e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let manager: TestActor;
  let collaborator: TestActor;
  let outsider: TestActor;
  let pageId: string;

  const api = (p: string) => `/api/v1/know${p}`;
  const upload = (
    a: TestActor,
    path: string,
    buf: Buffer,
    type = "application/pdf",
  ) =>
    http
      .post(api(path))
      .set(a.auth)
      .attach("file", buf, { filename: "doc.pdf", contentType: type });
  const fileStatus = async (key: string) =>
    (await http.get(`/api/v1/files/${key}`).set(manager.auth)).status;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    manager = await createActor(app, "docs-mgr", "MANAGER");
    await prisma.userCapability.create({
      data: {
        userId: manager.id,
        capability: "KNOW_SPACE_CREATE",
        grantedById: manager.id,
      },
    });
    collaborator = await createActor(
      app,
      "docs-col",
      "COLLABORATOR",
      manager.orgId,
    );
    outsider = await createActor(app, "docs-out", "MANAGER");
    const space = await http
      .post(api("/spaces"))
      .set(manager.auth)
      .send({ name: "Docs", icon: "book-open" });
    const page = await http
      .post(api(`/spaces/${space.body.data.id}/pages`))
      .set(manager.auth)
      .send({ title: "Docs page" });
    pageId = page.body.data.id;
  });

  afterAll(async () => app?.close());

  it("rejects unauthenticated requests", async () => {
    await http.get(api(`/pages/${pageId}/documents`)).expect(401);
  });

  it("lets a collaborator list but not upload", async () => {
    await http
      .get(api(`/pages/${pageId}/documents`))
      .set(collaborator.auth)
      .expect(200);
    await upload(collaborator, `/pages/${pageId}/documents`, pdf("x")).expect(
      403,
    );
  });

  it("rejects unknown mimetypes and content that does not match the declared type", async () => {
    await upload(
      manager,
      `/pages/${pageId}/documents`,
      Buffer.from("MZ"),
      "application/x-msdownload",
    ).expect(400);
    const svg = await upload(
      manager,
      `/pages/${pageId}/documents`,
      Buffer.from("<html><script>alert(1)</script></html>"),
      "image/svg+xml",
    ).expect(400);
    expect(svg.body.message).toMatch(/isn't supported/);
    await upload(
      manager,
      `/pages/${pageId}/documents`,
      Buffer.from("not a pdf at all"),
      "application/pdf",
    ).expect(400);
  });

  it("creates a document, adds a version and restores the first one", async () => {
    const created = await upload(
      manager,
      `/pages/${pageId}/documents`,
      pdf("one"),
    ).expect(201);
    const docId = created.body.data.id as string;
    const v1 = created.body.data.currentVersion.id as string;

    const v2 = await upload(
      manager,
      `/documents/${docId}/versions`,
      pdf("two"),
    ).expect(201);
    expect(v2.body.data.version).toBe(2);
    await upload(
      manager,
      `/documents/${docId}/versions`,
      Buffer.from("a,b"),
      "text/csv",
    ).expect(400);

    await http
      .post(api(`/documents/${docId}/versions/${v1}/restore`))
      .set(manager.auth)
      .expect(200);
    const list = await http
      .get(api(`/pages/${pageId}/documents`))
      .set(collaborator.auth)
      .expect(200);
    const doc = list.body.data.find((d: { id: string }) => d.id === docId);
    expect(doc.currentVersion.id).toBe(v1);
    expect(doc.versionsCount).toBe(2);

    const dl = await http
      .get(new URL(doc.currentVersion.url).pathname)
      .set(collaborator.auth)
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect((dl.body as Buffer).toString()).toContain("one");
  });

  it("deleting a document removes its rows and its files", async () => {
    const created = await upload(
      manager,
      `/pages/${pageId}/documents`,
      pdf("bye"),
    ).expect(201);
    const docId = created.body.data.id as string;
    await upload(manager, `/documents/${docId}/versions`, pdf("bye2")).expect(
      201,
    );
    const keys = (
      await prisma.documentVersion.findMany({ where: { documentId: docId } })
    ).map((v) => v.key);
    expect(keys).toHaveLength(2);
    for (const k of keys) expect(await fileStatus(k)).toBe(200);

    await http
      .delete(api(`/documents/${docId}`))
      .set(collaborator.auth)
      .expect(403);
    await http
      .delete(api(`/documents/${docId}`))
      .set(manager.auth)
      .expect(204);

    expect(await prisma.document.count({ where: { id: docId } })).toBe(0);
    expect(
      await prisma.documentVersion.count({ where: { documentId: docId } }),
    ).toBe(0);
    for (const k of keys) expect(await fileStatus(k)).toBe(404);
    await http
      .get(api(`/documents/${docId}/versions`))
      .set(manager.auth)
      .expect(404);
  });

  it("another organization cannot read, change or delete documents", async () => {
    const created = await upload(
      manager,
      `/pages/${pageId}/documents`,
      pdf("mine"),
    ).expect(201);
    const docId = created.body.data.id as string;
    const versionId = created.body.data.currentVersion.id as string;

    await http
      .get(api(`/pages/${pageId}/documents`))
      .set(outsider.auth)
      .expect(404);
    await upload(outsider, `/pages/${pageId}/documents`, pdf("x")).expect(404);
    await http
      .get(api(`/documents/${docId}/versions`))
      .set(outsider.auth)
      .expect(404);
    await http
      .get(api(`/documents/${docId}/versions/${versionId}/download`))
      .set(outsider.auth)
      .expect(404);
    await upload(outsider, `/documents/${docId}/versions`, pdf("x")).expect(
      404,
    );
    await http
      .post(api(`/documents/${docId}/versions/${versionId}/restore`))
      .set(outsider.auth)
      .expect(404);
    await http
      .delete(api(`/documents/${docId}`))
      .set(outsider.auth)
      .expect(404);
    expect(await prisma.document.count({ where: { id: docId } })).toBe(1);
  });

  describe("download and preview", () => {
    const download = (docId: string, versionId: string, query = "") =>
      http
        .get(api(`/documents/${docId}/versions/${versionId}/download${query}`))
        .set(manager.auth);
    const create = async (buf: Buffer, filename: string, type: string) => {
      const res = await http
        .post(api(`/pages/${pageId}/documents`))
        .set(manager.auth)
        .attach("file", buf, { filename, contentType: type })
        .expect(201);
      return [res.body.data.id, res.body.data.currentVersion.id] as const;
    };

    it("shows a PDF inline only when asked, and names the file in UTF-8", async () => {
      const [docId, versionId] = await create(
        pdf("x"),
        "Política de uso.pdf",
        "application/pdf",
      );
      const plain = await download(docId, versionId).expect(200);
      expect(plain.headers["content-disposition"]).toMatch(/^attachment;/);
      const inline = await download(docId, versionId, "?inline=1").expect(200);
      expect(inline.headers["content-disposition"]).toMatch(/^inline;/);
      expect(inline.headers["content-type"]).toBe("application/pdf");
      expect(inline.headers["content-disposition"]).toContain(
        `filename*=UTF-8''${encodeURIComponent("Política de uso.pdf")}`,
      );
    });

    it("never shows SVG or Office files inline", async () => {
      const [svgId, svgVersion] = await create(
        Buffer.from("<svg/>"),
        "logo.svg",
        "image/svg+xml",
      );
      const svg = await download(svgId, svgVersion, "?inline=1").expect(200);
      expect(svg.headers["content-disposition"]).toMatch(/^attachment;/);
      const zip = Buffer.concat([
        Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        Buffer.alloc(40),
      ]);
      const [docxId, docxVersion] = await create(
        zip,
        "Plan.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      );
      const docx = await download(docxId, docxVersion, "?inline=1").expect(200);
      expect(docx.headers["content-disposition"]).toMatch(/^attachment;/);
    });

    it("another organization cannot preview", async () => {
      const [docId, versionId] = await create(
        pdf("x"),
        "a.pdf",
        "application/pdf",
      );
      await http
        .get(api(`/documents/${docId}/versions/${versionId}/download?inline=1`))
        .set(outsider.auth)
        .expect(404);
    });
  });

  describe("received to disk, not memory", () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), "docs-e2e-"));
      process.env.UPLOAD_TMP_DIR = dir;
    });
    afterEach(async () => {
      delete process.env.UPLOAD_TMP_DIR;
      delete (app.get(UploadGate) as Partial<UploadGate>).readFreeBytes;
      await rm(dir, { recursive: true, force: true });
    });

    it("stores the file and leaves nothing in the temp folder, also when refused", async () => {
      await upload(manager, `/pages/${pageId}/documents`, pdf("disk")).expect(
        201,
      );
      await upload(
        manager,
        `/pages/${pageId}/documents`,
        Buffer.from("not a pdf at all"),
      ).expect(400);
      await upload(collaborator, `/pages/${pageId}/documents`, pdf("x")).expect(
        403,
      );
      expect(await readdir(dir)).toEqual([]);
    });

    it("answers 507 when the temp folder has no room, and keeps nothing", async () => {
      app.get(UploadGate).readFreeBytes = async () => 1024;
      const before = await prisma.document.count({ where: { pageId } });
      const res = await upload(
        manager,
        `/pages/${pageId}/documents`,
        pdf("full"),
      ).expect(507);
      expect(res.body.code).toBe("UPLOAD_NO_SPACE");
      expect(await prisma.document.count({ where: { pageId } })).toBe(before);
      expect(await readdir(dir)).toEqual([]);
    });
  });
});
