import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { StorageService } from "../storage/storage.service";
import { createActor, createTestApp, TestActor } from "../../test-helpers";
import { sweepOrphanImages } from "./orphan-images";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
const pdf = (text: string) => Buffer.from(`%PDF-1.4\n${text}\n`);
const binary = (
  res: request.Response,
  cb: (err: Error | null, body: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on("data", (c: Buffer) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};
const withImage = (key: string) => ({
  type: "doc",
  content: [{ type: "image", attrs: { src: key } }, { type: "paragraph" }],
});
const empty = { type: "doc", content: [{ type: "paragraph" }] };

/** Files that belong to a space (images of its description and attached documents). */
describe("KNOW space files e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let storage: StorageService;
  let http: ReturnType<typeof request>;
  let manager: TestActor; // manages every space it creates
  let reader: TestActor; // implicit VIEWER of open spaces
  let outsider: TestActor; // another organization

  const api = (p: string) => `/api/v1/know${p}`;
  const fileStatus = async (key: string) =>
    (await http.get(`/api/v1/files/${key}`).set(manager.auth)).status;
  const mkSpace = async (name: string, restricted = false) =>
    (
      await http
        .post(api("/spaces"))
        .set(manager.auth)
        .send({ name, restricted })
        .expect(201)
    ).body.data.id as string;
  const uploadImage = (a: TestActor, spaceId: string) =>
    http
      .post(api(`/spaces/${spaceId}/images`))
      .set(a.auth)
      .attach("file", PNG, { filename: "a.png", contentType: "image/png" });
  const uploadDocument = (a: TestActor, spaceId: string, text = "one") =>
    http
      .post(api(`/spaces/${spaceId}/documents`))
      .set(a.auth)
      .attach("file", pdf(text), {
        filename: "Space doc.pdf",
        contentType: "application/pdf",
      });
  const versionKeys = async (documentId: string) =>
    (await prisma.documentVersion.findMany({ where: { documentId } })).map(
      (v) => v.key,
    );
  const storePage = (pageId: string, body: object) =>
    http
      .put(`/api/v1/internal/collab/documents/know.page/${pageId}`)
      .set({ "X-Collab-Secret": process.env.COLLAB_INTERNAL_SECRET ?? "" })
      .send({
        ydoc: Buffer.from([1]).toString("base64"),
        fields: { body, title: "t" },
        editors: [],
      })
      .expect(204);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    storage = app.get(StorageService);
    http = request(app.getHttpServer());
    manager = await createActor(app, "sf-mgr", "MANAGER");
    await prisma.userCapability.createMany({
      data: (["KNOW_SPACE_CREATE", "KNOW_SPACE_DELETE"] as const).map(
        (capability) => ({
          userId: manager.id,
          capability,
          grantedById: manager.id,
        }),
      ),
    });
    reader = await createActor(app, "sf-reader", "COLLABORATOR", manager.orgId);
    outsider = await createActor(app, "sf-out", "ADMIN");
  });

  afterAll(async () => app?.close());

  describe("images of a space", () => {
    it("a manager uploads and deletes an image under the space's folder", async () => {
      const spaceId = await mkSpace("Images");
      const res = await uploadImage(manager, spaceId).expect(201);
      const key = res.body.data.key as string;
      expect(key).toMatch(
        new RegExp(
          `^organizations/${manager.orgId}/spaces/${spaceId}/images/[0-9a-f-]+\\.png$`,
        ),
      );
      expect(res.body.data.url).toContain(`/files/organizations/`);
      expect(await fileStatus(key)).toBe(200);

      await http
        .delete(api(`/spaces/${spaceId}/images`))
        .query({ key })
        .set(manager.auth)
        .expect(204);
      expect(await fileStatus(key)).toBe(404);
    });

    it("a reader of the space can neither upload nor delete", async () => {
      const spaceId = await mkSpace("Images reader");
      const key = (await uploadImage(manager, spaceId).expect(201)).body.data
        .key as string;
      await uploadImage(reader, spaceId).expect(403);
      await http
        .delete(api(`/spaces/${spaceId}/images`))
        .query({ key })
        .set(reader.auth)
        .expect(403);
      expect(await fileStatus(key)).toBe(200);
    });

    // Needs T8 (`GET /files/*key` asks the owning feature): before it, any member of the organization reads it.
    it("an image of a restricted space's description is readable only by who can read the space", async () => {
      const spaceId = await mkSpace("Images restricted", true);
      const key = (await uploadImage(manager, spaceId).expect(201)).body.data
        .key as string;
      const asReader = () => http.get(`/api/v1/files/${key}`).set(reader.auth);
      await asReader().expect(404);
      await http
        .post(api(`/spaces/${spaceId}/access`))
        .set(manager.auth)
        .send({ principalType: "USER", principalId: reader.id, role: "VIEWER" })
        .expect(201);
      await asReader().expect(200);
    });

    it("refuses to delete a key that is not an image of that space", async () => {
      const a = await mkSpace("Images a");
      const b = await mkSpace("Images b");
      const keyOfB = (await uploadImage(manager, b).expect(201)).body.data
        .key as string;
      await http
        .delete(api(`/spaces/${a}/images`))
        .query({ key: keyOfB })
        .set(manager.auth)
        .expect(403);
      expect(await fileStatus(keyOfB)).toBe(200);
    });
  });

  describe("documents of a space", () => {
    it("a manager uploads, versions, restores and deletes; a reader lists and downloads", async () => {
      const spaceId = await mkSpace("Docs");
      const created = await uploadDocument(manager, spaceId).expect(201);
      const doc = created.body.data;
      expect(doc.spaceId).toBe(spaceId);
      expect(doc.pageId).toBeNull();
      expect(doc.name).toBe("Space doc.pdf");
      const [key] = await versionKeys(doc.id);
      expect(key).toBe(
        `organizations/${manager.orgId}/spaces/${spaceId}/documents/${doc.id}/v1.pdf`,
      );

      const list = await http
        .get(api(`/spaces/${spaceId}/documents`))
        .set(reader.auth)
        .expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({
        id: doc.id,
        spaceId,
        pageId: null,
      });

      const dl = await http
        .get(new URL(doc.currentVersion.url).pathname)
        .set(reader.auth)
        .buffer(true)
        .parse(binary)
        .expect(200);
      expect((dl.body as Buffer).toString()).toContain("one");
      await http
        .get(api(`/documents/${doc.id}/versions`))
        .set(reader.auth)
        .expect(200);

      const v2 = await http
        .post(api(`/documents/${doc.id}/versions`))
        .set(manager.auth)
        .attach("file", pdf("two"), {
          filename: "x.pdf",
          contentType: "application/pdf",
        })
        .expect(201);
      expect(v2.body.data.version).toBe(2);
      expect(await versionKeys(doc.id)).toContain(
        `organizations/${manager.orgId}/spaces/${spaceId}/documents/${doc.id}/v2.pdf`,
      );
      await http
        .post(
          api(`/documents/${doc.id}/versions/${doc.currentVersion.id}/restore`),
        )
        .set(manager.auth)
        .expect(200);

      const keys = await versionKeys(doc.id);
      await http
        .delete(api(`/documents/${doc.id}`))
        .set(manager.auth)
        .expect(204);
      expect(await prisma.document.count({ where: { id: doc.id } })).toBe(0);
      for (const k of keys) expect(await fileStatus(k)).toBe(404);
    });

    it("a reader of the space cannot upload, add a version, restore or delete", async () => {
      const spaceId = await mkSpace("Docs reader");
      const doc = (await uploadDocument(manager, spaceId).expect(201)).body
        .data;
      await uploadDocument(reader, spaceId).expect(403);
      await http
        .post(api(`/documents/${doc.id}/versions`))
        .set(reader.auth)
        .attach("file", pdf("x"), {
          filename: "x.pdf",
          contentType: "application/pdf",
        })
        .expect(403);
      await http
        .post(
          api(`/documents/${doc.id}/versions/${doc.currentVersion.id}/restore`),
        )
        .set(reader.auth)
        .expect(403);
      await http
        .delete(api(`/documents/${doc.id}`))
        .set(reader.auth)
        .expect(403);
      expect(await prisma.document.count({ where: { id: doc.id } })).toBe(1);
    });

    it("a page's documents say which page they belong to and no space", async () => {
      const spaceId = await mkSpace("Docs page");
      const page = await http
        .post(api(`/spaces/${spaceId}/pages`))
        .set(manager.auth)
        .send({ title: "p" })
        .expect(201);
      const res = await http
        .post(api(`/pages/${page.body.data.id}/documents`))
        .set(manager.auth)
        .attach("file", pdf("x"), {
          filename: "x.pdf",
          contentType: "application/pdf",
        })
        .expect(201);
      expect(res.body.data.pageId).toBe(page.body.data.id);
      expect(res.body.data.spaceId).toBeNull();
      const spaceDocs = await http
        .get(api(`/spaces/${spaceId}/documents`))
        .set(manager.auth)
        .expect(200);
      expect(spaceDocs.body.data).toEqual([]);
    });

    it("the database refuses a document with no owner or with two", async () => {
      const spaceId = await mkSpace("Docs check");
      const page = await http
        .post(api(`/spaces/${spaceId}/pages`))
        .set(manager.auth)
        .send({ title: "p" })
        .expect(201);
      const base = { name: "x", createdById: manager.id };
      await expect(prisma.document.create({ data: base })).rejects.toThrow();
      await expect(
        prisma.document.create({
          data: { ...base, spaceId, pageId: page.body.data.id },
        }),
      ).rejects.toThrow();
    });
  });

  describe("isolation", () => {
    let spaceId: string;
    let restricted: string;
    let doc: { id: string; currentVersion: { id: string } };
    let restrictedDoc: { id: string; currentVersion: { id: string } };
    let imageKey: string;

    beforeAll(async () => {
      spaceId = await mkSpace("Isolated");
      restricted = await mkSpace("Isolated restricted", true);
      doc = (await uploadDocument(manager, spaceId).expect(201)).body.data;
      restrictedDoc = (await uploadDocument(manager, restricted).expect(201))
        .body.data;
      imageKey = (await uploadImage(manager, spaceId).expect(201)).body.data
        .key;
    });

    const everyRoute = (
      who: () => TestActor,
      space: () => string,
      document: () => { id: string; currentVersion: { id: string } },
    ) => [
      () => uploadImage(who(), space()),
      () =>
        http
          .delete(api(`/spaces/${space()}/images`))
          .query({ key: imageKey })
          .set(who().auth),
      () => uploadDocument(who(), space()),
      () => http.get(api(`/spaces/${space()}/documents`)).set(who().auth),
      () =>
        http.get(api(`/documents/${document().id}/versions`)).set(who().auth),
      () =>
        http
          .get(
            api(
              `/documents/${document().id}/versions/${document().currentVersion.id}/download`,
            ),
          )
          .set(who().auth),
      () =>
        http
          .post(api(`/documents/${document().id}/versions`))
          .set(who().auth)
          .attach("file", pdf("x"), {
            filename: "x.pdf",
            contentType: "application/pdf",
          }),
      () =>
        http
          .post(
            api(
              `/documents/${document().id}/versions/${document().currentVersion.id}/restore`,
            ),
          )
          .set(who().auth),
      () => http.delete(api(`/documents/${document().id}`)).set(who().auth),
    ];

    it("another organization gets 404 on every route", async () => {
      for (const call of everyRoute(
        () => outsider,
        () => spaceId,
        () => doc,
      )) {
        expect((await call()).status).toBe(404);
      }
      expect(await prisma.document.count({ where: { id: doc.id } })).toBe(1);
      expect(await fileStatus(imageKey)).toBe(200);
    });

    it("someone without access to a restricted space gets 404 on every route", async () => {
      for (const call of everyRoute(
        () => reader,
        () => restricted,
        () => restrictedDoc,
      )) {
        expect((await call()).status).toBe(404);
      }
      expect(
        await prisma.document.count({ where: { id: restrictedDoc.id } }),
      ).toBe(1);
    });
  });

  describe("cleanup", () => {
    it("deleting a space empties its storage folder and removes its documents", async () => {
      const spaceId = await mkSpace("Doomed");
      const keep = await mkSpace("Survivor");
      const keptImage = (await uploadImage(manager, keep).expect(201)).body.data
        .key as string;
      await uploadImage(manager, spaceId).expect(201);
      const doc = (await uploadDocument(manager, spaceId).expect(201)).body
        .data;
      const prefix = `organizations/${manager.orgId}/spaces/${spaceId}/`;
      expect((await storage.listObjects(prefix)).length).toBe(2);

      await http
        .delete(api(`/spaces/${spaceId}`))
        .set(manager.auth)
        .expect(200);
      expect(await storage.listObjects(prefix)).toEqual([]);
      expect(await prisma.document.count({ where: { id: doc.id } })).toBe(0);
      expect(await fileStatus(keptImage)).toBe(200);
    });

    it("an image a space description uses survives leaving a page body", async () => {
      const spaceId = await mkSpace("Shared image");
      const page = await http
        .post(api(`/spaces/${spaceId}/pages`))
        .set(manager.auth)
        .send({ title: "p" })
        .expect(201);
      const pageId = page.body.data.id as string;
      const key = (
        await http
          .post(api(`/pages/${pageId}/images`))
          .set(manager.auth)
          .attach("file", PNG, { filename: "a.png", contentType: "image/png" })
          .expect(201)
      ).body.data.key as string;
      await prisma.space.update({
        where: { id: spaceId },
        data: { descriptionContent: withImage(key) },
      });
      await storePage(pageId, withImage(key));
      await storePage(pageId, empty);
      expect(await fileStatus(key)).toBe(200);
    });

    it("the orphan sweep removes unused space images and keeps those a description uses", async () => {
      const spaceId = await mkSpace("Sweep space");
      const orphan = (await uploadImage(manager, spaceId).expect(201)).body.data
        .key as string;
      const used = (await uploadImage(manager, spaceId).expect(201)).body.data
        .key as string;
      await prisma.space.update({
        where: { id: spaceId },
        data: { descriptionContent: withImage(used) },
      });
      const sweep = (apply: boolean) =>
        sweepOrphanImages(prisma, storage, {
          apply,
          graceMs: 0,
          prefix: `organizations/${manager.orgId}/`,
        });
      const found = await sweep(false);
      expect(found).toContain(orphan);
      expect(found).not.toContain(used);
      await sweep(true);
      expect(await fileStatus(orphan)).toBe(404);
      expect(await fileStatus(used)).toBe(200);
    });
  });
});
