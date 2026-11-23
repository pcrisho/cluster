import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, TestActor } from "../../test-helpers";

const SECRET = "test-collab-secret-".repeat(4);
const doc = (text: string) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});
const withImage = (key: string) => ({
  type: "doc",
  content: [{ type: "image", attrs: { src: key } }, { type: "paragraph" }],
});
const b64 = (bytes: number[] | Buffer) => Buffer.from(bytes).toString("base64");
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

/** The space description as a live document (`know.space`), through the internal collab endpoints. */
describe("KNOW space description collab e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let previousSecret: string | undefined;

  let admin: TestActor;
  let manager: TestActor; // MANAGER entry on the restricted space
  let editor: TestActor; // EDITOR entry: may edit pages, not the description
  let viewer: TestActor; // VIEWER entry
  let outsider: TestActor; // no entry
  let otherOrgAdmin: TestActor;
  let restricted: string;

  const asCollab = { "X-Collab-Secret": SECRET };
  const api = (p: string) => `/api/v1/know${p}`;
  const url = (spaceId: string, suffix = "") =>
    `/api/v1/internal/collab/documents/know.space/${spaceId}${suffix}`;
  const authorizeUser = (userId: string, spaceId: string) =>
    http
      .post("/api/v1/internal/collab/authorize-user")
      .set(asCollab)
      .send({ userId, documentName: `know.space:${spaceId}` });
  const mkSpace = (over: { name?: string; descriptionContent?: object } = {}) =>
    prisma.space
      .create({
        data: {
          name: over.name ?? "Live space",
          descriptionContent: over.descriptionContent,
          organizationId: admin.orgId,
          createdBy: admin.id,
        },
      })
      .then((s) => s.id);
  const row = (id: string) =>
    prisma.space.findUniqueOrThrow({ where: { id }, omit: { ydoc: false } });
  const store = (spaceId: string, body: unknown, title = "Ignored title") =>
    http
      .put(url(spaceId))
      .set(asCollab)
      .send({ ydoc: b64([7, 7, 7]), fields: { body, title }, editors: [] });
  const fileStatus = async (key: string) =>
    (await http.get(`/api/v1/files/${key}`).set(admin.auth)).status;
  const uploadImage = async (path: string) =>
    (
      await http
        .post(api(path))
        .set(admin.auth)
        .attach("file", PNG, { filename: "a.png", contentType: "image/png" })
        .expect(201)
    ).body.data.key as string;

  beforeAll(async () => {
    previousSecret = process.env.COLLAB_INTERNAL_SECRET;
    process.env.COLLAB_INTERNAL_SECRET = SECRET;
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());

    admin = await createActor(app, "sc-admin", "ADMIN");
    const org = admin.orgId;
    manager = await createActor(app, "sc-manager", "COLLABORATOR", org);
    editor = await createActor(app, "sc-editor", "COLLABORATOR", org);
    viewer = await createActor(app, "sc-viewer", "COLLABORATOR", org);
    outsider = await createActor(app, "sc-out", "COLLABORATOR", org);
    otherOrgAdmin = await createActor(app, "sc-other", "ADMIN");

    restricted = (
      await prisma.space.create({
        data: {
          name: "Restricted live",
          restricted: true,
          organizationId: org,
          createdBy: admin.id,
        },
      })
    ).id;
    for (const [user, role] of [
      [manager, "MANAGER"],
      [editor, "EDITOR"],
      [viewer, "VIEWER"],
    ] as const) {
      await prisma.spaceAccess.create({
        data: {
          spaceId: restricted,
          userId: user.id,
          role,
          createdById: admin.id,
        },
      });
    }
  });

  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.COLLAB_INTERNAL_SECRET;
    else process.env.COLLAB_INTERNAL_SECRET = previousSecret;
    await app?.close();
  });

  describe("authorize", () => {
    it("gives WRITE to an organization ADMIN and to a space MANAGER", async () => {
      expect(
        (await authorizeUser(admin.id, restricted).expect(200)).body.mode,
      ).toBe("WRITE");
      expect(
        (await authorizeUser(manager.id, restricted).expect(200)).body.mode,
      ).toBe("WRITE");
    });

    it("gives READ to an EDITOR and a VIEWER of the space", async () => {
      expect(
        (await authorizeUser(editor.id, restricted).expect(200)).body.mode,
      ).toBe("READ");
      expect(
        (await authorizeUser(viewer.id, restricted).expect(200)).body.mode,
      ).toBe("READ");
    });

    it("gives READ to an implicit viewer of an open space", async () => {
      const open = await mkSpace();
      expect(
        (await authorizeUser(outsider.id, open).expect(200)).body.mode,
      ).toBe("READ");
    });

    it("answers 404 without access, to another organization and for an unknown space", async () => {
      const hidden = await authorizeUser(outsider.id, restricted).expect(404);
      await authorizeUser(otherOrgAdmin.id, restricted).expect(404);
      await authorizeUser(otherOrgAdmin.id, await mkSpace()).expect(404);
      const missing = await authorizeUser(outsider.id, randomUUID()).expect(
        404,
      );
      expect(missing.body).toEqual(hidden.body);
    });
  });

  describe("load", () => {
    it("returns no state, the description as body and the name as title", async () => {
      const id = await mkSpace({
        name: "Handbook",
        descriptionContent: doc("welcome"),
      });
      const res = await http.get(url(id)).set(asCollab).expect(200);
      expect(res.body).toEqual({
        ydoc: null,
        revision: 0,
        fields: { body: doc("welcome"), title: "Handbook" },
      });
    });

    it("returns an empty document when the space has no description", async () => {
      const id = await mkSpace();
      const res = await http.get(url(id)).set(asCollab).expect(200);
      expect(res.body.fields.body).toEqual({
        type: "doc",
        content: [{ type: "paragraph" }],
      });
    });

    it("returns the stored state and answers 404 for an unknown space", async () => {
      const id = await mkSpace();
      await prisma.space.update({
        where: { id },
        data: { ydoc: Buffer.from([1, 2, 3]), ydocRevision: 4 },
      });
      const res = await http.get(url(id)).set(asCollab).expect(200);
      expect(res.body.ydoc).toBe(b64([1, 2, 3]));
      expect(res.body.revision).toBe(4);
      await http.get(url(randomUUID())).set(asCollab).expect(404);
    });
  });

  describe("seed", () => {
    it("stores the state once, without touching updatedAt", async () => {
      const id = await mkSpace();
      const before = await row(id);
      await http
        .put(url(id, "/seed"))
        .set(asCollab)
        .send({ ydoc: b64([1, 1]) })
        .expect(204);
      await http
        .put(url(id, "/seed"))
        .set(asCollab)
        .send({ ydoc: b64([2, 2]) })
        .expect(409);
      const after = await row(id);
      expect(Buffer.from(after.ydoc!)).toEqual(Buffer.from([1, 1]));
      expect(after.ydocRevision).toBe(1);
      expect(after.updatedAt).toEqual(before.updatedAt);
    });

    it("answers 404 when the space does not exist", async () => {
      await http
        .put(url(randomUUID(), "/seed"))
        .set(asCollab)
        .send({ ydoc: b64([1]) })
        .expect(404);
    });
  });

  describe("store", () => {
    it("saves the description and the state, and ignores the title", async () => {
      const id = await mkSpace({
        name: "Keeps its name",
        descriptionContent: doc("old"),
      });
      await store(id, doc("new description"), "Renamed live").expect(204);
      const saved = await row(id);
      expect(saved.descriptionContent).toEqual(doc("new description"));
      expect(Buffer.from(saved.ydoc!)).toEqual(Buffer.from([7, 7, 7]));
      expect(saved.ydocRevision).toBe(1);
      expect(saved.name).toBe("Keeps its name");
    });

    it("rejects content that is not valid with 422 and changes nothing", async () => {
      const id = await mkSpace({ descriptionContent: doc("good") });
      await store(id, {
        type: "doc",
        content: [{ type: "unknownNode" }],
      }).expect(422);
      const foreign = `organizations/${otherOrgAdmin.orgId}/spaces/${id}/images/x.png`;
      await store(id, withImage(foreign)).expect(422);
      const saved = await row(id);
      expect(saved.descriptionContent).toEqual(doc("good"));
      expect(saved.ydocRevision).toBe(0);
    });

    it("answers 404 for an unknown space", async () => {
      await store(randomUUID(), doc("x")).expect(404);
    });

    it("deletes an image of the space that left the description", async () => {
      const id = await mkSpace();
      const key = await uploadImage(`/spaces/${id}/images`);
      await store(id, withImage(key)).expect(204);
      expect(await fileStatus(key)).toBe(200);
      await store(id, doc("no image")).expect(204);
      expect(await fileStatus(key)).toBe(404);
    });

    it("keeps an image that something else still uses, and never touches a page's images", async () => {
      const id = await mkSpace();
      const shared = await uploadImage(`/spaces/${id}/images`);
      const page = await prisma.page.create({
        data: {
          spaceId: id,
          title: "p",
          authorId: admin.id,
          content: withImage(shared),
          searchText: "",
        },
      });
      const pageImage = await uploadImage(`/pages/${page.id}/images`);
      await store(id, {
        type: "doc",
        content: [
          ...withImage(shared).content,
          ...withImage(pageImage).content,
        ],
      }).expect(204);
      await store(id, doc("nothing")).expect(204);
      expect(await fileStatus(shared)).toBe(200); // the page body uses it
      expect(await fileStatus(pageImage)).toBe(200); // not a key of this space's description folder
    });
  });

  describe("REST", () => {
    it("PATCH no longer changes the description (only the live document does)", async () => {
      const id = await mkSpace({
        name: "REST",
        descriptionContent: doc("live"),
      });
      const res = await http
        .patch(api(`/spaces/${id}`))
        .set(admin.auth)
        .send({ name: "REST renamed", descriptionContent: doc("overwritten") })
        .expect(200);
      expect(res.body.data.name).toBe("REST renamed");
      expect((await row(id)).descriptionContent).toEqual(doc("live"));
    });

    it("POST still seeds the description", async () => {
      const res = await http
        .post(api("/spaces"))
        .set(admin.auth)
        .send({ name: "Seeded", descriptionContent: doc("first words") })
        .expect(201);
      expect((await row(res.body.data.id)).descriptionContent).toEqual(
        doc("first words"),
      );
    });
  });
});
