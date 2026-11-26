import { INestApplication } from "@nestjs/common"
import { randomUUID } from "crypto"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

const SECRET = "test-collab-secret-".repeat(4)
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
const b64 = (bytes: number[] | Buffer) => Buffer.from(bytes).toString("base64")

/** What apps/collab calls to load, seed and store a KNOW page, through the internal endpoints. */
describe("KNOW collab documents e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  let previousEnv: Record<string, string | undefined>
  let admin: TestActor
  let editorUser: TestActor
  let otherOrgAdmin: TestActor
  let spaceId: string

  const url = (pageId: string, suffix = "") => `/api/v1/internal/collab/documents/know.page/${pageId}${suffix}`
  const asCollab = { "X-Collab-Secret": SECRET }
  const mkPage = (title = "Doc page", text = "initial text") =>
    prisma.page
      .create({
        data: { spaceId, title, authorId: admin.id, content: doc(text), searchText: text, publishedAt: new Date() },
      })
      .then((p) => p.id)
  const row = (pageId: string) => prisma.page.findUniqueOrThrow({ where: { id: pageId }, omit: { ydoc: false } })
  const store = (pageId: string, body: object) => http.put(url(pageId)).set(asCollab).send(body)
  const input = (over: Record<string, unknown> = {}) => ({
    ydoc: b64([9, 9, 9]),
    fields: { body: doc("new body text"), title: "New title" },
    editors: [],
    ...over,
  })

  beforeAll(async () => {
    previousEnv = {
      COLLAB_INTERNAL_SECRET: process.env.COLLAB_INTERNAL_SECRET,
      COLLAB_MAX_DOC_BYTES: process.env.COLLAB_MAX_DOC_BYTES,
    }
    process.env.COLLAB_INTERNAL_SECRET = SECRET
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    admin = await createActor(app, "docs-admin", "ADMIN")
    editorUser = await createActor(app, "docs-editor", "COLLABORATOR", admin.orgId)
    otherOrgAdmin = await createActor(app, "docs-other", "ADMIN")
    spaceId = (
      await prisma.space.create({ data: { name: "Docs space", organizationId: admin.orgId, createdBy: admin.id } })
    ).id
  })

  afterAll(async () => {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await app?.close()
  })

  describe("authentication", () => {
    it.each([
      ["GET load", (id: string) => http.get(url(id))],
      ["PUT seed", (id: string) => http.put(url(id, "/seed")).send({ ydoc: b64([1]) })],
      ["PUT store", (id: string) => http.put(url(id)).send(input())],
    ])("%s without the secret answers 401", async (_name, call) => {
      expect((await call(await mkPage())).status).toBe(401)
    })
  })

  describe("load", () => {
    it("returns no state and the derived fields for a page that was never opened", async () => {
      const id = await mkPage("Plain title", "plain body")
      const res = await http.get(url(id)).set(asCollab).expect(200)
      expect(res.body).toEqual({ ydoc: null, revision: 0, fields: { body: doc("plain body"), title: "Plain title" } })
    })

    it("returns the stored state as base64", async () => {
      const id = await mkPage()
      await prisma.page.update({ where: { id }, data: { ydoc: Buffer.from([1, 2, 3]), ydocRevision: 4 } })
      const res = await http.get(url(id)).set(asCollab).expect(200)
      expect(res.body.ydoc).toBe(b64([1, 2, 3]))
      expect(res.body.revision).toBe(4)
    })

    it("answers 404 for an unknown page and for an unknown kind", async () => {
      await http.get(url(randomUUID())).set(asCollab).expect(404)
      await http
        .get(`/api/v1/internal/collab/documents/nope.kind/${randomUUID()}`)
        .set(asCollab)
        .expect(404)
    })

    it("rejects an id that is not a UUID", async () => {
      await http.get("/api/v1/internal/collab/documents/know.page/not-a-uuid").set(asCollab).expect(400)
    })
  })

  describe("seed", () => {
    it("stores the state once and bumps the revision to 1", async () => {
      const id = await mkPage()
      const before = await row(id)
      await http.put(url(id, "/seed")).set(asCollab).send({ ydoc: b64([1, 2, 3]) }).expect(204)
      const saved = await row(id)
      expect(saved.updatedAt).toEqual(before.updatedAt)
      expect(Buffer.from(saved.ydoc!).equals(Buffer.from([1, 2, 3]))).toBe(true)
      expect(saved.ydocRevision).toBe(1)
    })

    it("answers 409 to a second seed and keeps the first state", async () => {
      const id = await mkPage()
      await http.put(url(id, "/seed")).set(asCollab).send({ ydoc: b64([1]) }).expect(204)
      await http.put(url(id, "/seed")).set(asCollab).send({ ydoc: b64([2]) }).expect(409)
      expect(Buffer.from((await row(id)).ydoc!).equals(Buffer.from([1]))).toBe(true)
    })

    it("lets exactly one of two simultaneous seeds win", async () => {
      const id = await mkPage()
      const results = await Promise.all(
        [[1, 1], [2, 2]].map((bytes) => http.put(url(id, "/seed")).set(asCollab).send({ ydoc: b64(bytes) })),
      )
      expect(results.map((r) => r.status).sort()).toEqual([204, 409])
      const winner = results.findIndex((r) => r.status === 204)
      expect(Buffer.from((await row(id)).ydoc!).equals(Buffer.from([[1, 1], [2, 2]][winner]))).toBe(true)
    })

    it("answers 404 when the page does not exist", async () => {
      await http.put(url(randomUUID(), "/seed")).set(asCollab).send({ ydoc: b64([1]) }).expect(404)
    })

    it("rejects a body that is not base64", async () => {
      const id = await mkPage()
      await http.put(url(id, "/seed")).set(asCollab).send({ ydoc: "***not base64***" }).expect(400)
      await http.put(url(id, "/seed")).set(asCollab).send({}).expect(400)
    })
  })

  describe("store", () => {
    it("saves state and derived fields together, and search finds the new text", async () => {
      const id = await mkPage("Old title", "old words")
      await prisma.page.update({ where: { id }, data: { ydoc: Buffer.from([1]), ydocRevision: 1 } })
      const before = await row(id)

      await store(id, input({ fields: { body: doc("platypus habitat"), title: "Wildlife" }, editors: [editorUser.id] })).expect(
        204,
      )

      const saved = await row(id)
      expect(Buffer.from(saved.ydoc!).equals(Buffer.from([9, 9, 9]))).toBe(true)
      expect(saved.ydocRevision).toBe(2)
      expect(saved.content).toEqual(doc("platypus habitat"))
      expect(saved.title).toBe("Wildlife")
      expect(saved.searchText).toBe("platypus habitat")
      expect(saved.lastEditedById).toBe(editorUser.id)
      expect(saved.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime())

      const found = await http.get("/api/v1/know/search?q=platypus").set(admin.auth).expect(200)
      expect(found.body.data.map((p: { id: string }) => p.id)).toContain(id)
      const page = await http.get(`/api/v1/know/pages/${id}`).set(admin.auth).expect(200)
      expect(page.body.data.title).toBe("Wildlife")
    })

    it("records the last editor of the list and ignores people of other organizations", async () => {
      const id = await mkPage()
      await store(id, input({ editors: [admin.id, editorUser.id] })).expect(204)
      expect((await row(id)).lastEditedById).toBe(editorUser.id)

      await store(id, input({ editors: [otherOrgAdmin.id] })).expect(204)
      expect((await row(id)).lastEditedById).toBe(editorUser.id)

      await store(id, input({ editors: [] })).expect(204)
      expect((await row(id)).lastEditedById).toBe(editorUser.id)
    })

    it("shows who edited last in the page tree", async () => {
      const id = await mkPage()
      await store(id, input({ editors: [editorUser.id] })).expect(204)
      const tree = await http.get(`/api/v1/know/spaces/${spaceId}/pages`).set(admin.auth).expect(200)
      const node = tree.body.data.find((p: { id: string }) => p.id === id)
      expect(node.lastEditedBy.id).toBe(editorUser.id)
    })

    it("keeps an empty title, like the REST API does", async () => {
      const id = await mkPage("Has a title")
      await store(id, input({ fields: { body: doc("x"), title: "" } })).expect(204)
      expect((await row(id)).title).toBe("")
    })

    describe("content that is not valid is rejected with 422 and nothing changes", () => {
      const ownKey = () => `organizations/${admin.orgId}/pages/${randomUUID()}/images/${randomUUID()}.png`
      const cases: [string, () => object][] = [
        ["an unknown node type", () => ({ body: { type: "doc", content: [{ type: "scriptNode" }] }, title: "t" })],
        [
          "a javascript: link",
          () => ({
            body: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
                },
              ],
            },
            title: "t",
          }),
        ],
        [
          "an image of another organization",
          () => ({
            body: {
              type: "doc",
              content: [
                { type: "image", attrs: { src: `organizations/${otherOrgAdmin.orgId}/pages/${randomUUID()}/images/${randomUUID()}.png` } },
              ],
            },
            title: "t",
          }),
        ],
        ["a title over 200 characters", () => ({ body: doc("x"), title: "t".repeat(201) })],
        ["a title with a line break", () => ({ body: doc("x"), title: "two\nlines" })],
      ]
      it.each(cases)("%s", async (_name, fields) => {
        const id = await mkPage("Stable", "stable text")
        await prisma.page.update({ where: { id }, data: { ydoc: Buffer.from([1]), ydocRevision: 1 } })
        await store(id, input({ fields: fields() })).expect(422)
        const saved = await row(id)
        expect(saved.title).toBe("Stable")
        expect(saved.content).toEqual(doc("stable text"))
        expect(saved.ydocRevision).toBe(1)
        expect(Buffer.from(saved.ydoc!).equals(Buffer.from([1]))).toBe(true)
      })

      it("accepts an image whose key belongs to the page's organization", async () => {
        const id = await mkPage()
        const body = { type: "doc", content: [{ type: "image", attrs: { src: ownKey() } }, { type: "paragraph" }] }
        await store(id, input({ fields: { body, title: "t" } })).expect(204)
      })
    })

    it("answers 413 for a state over the configured maximum and keeps the saved one", async () => {
      process.env.COLLAB_MAX_DOC_BYTES = "100"
      const id = await mkPage()
      await prisma.page.update({ where: { id }, data: { ydoc: Buffer.from([1]), ydocRevision: 1 } })
      await store(id, input({ ydoc: b64(Buffer.alloc(101, 7)) })).expect(413)
      await http.put(url(id, "/seed")).set(asCollab).send({ ydoc: b64(Buffer.alloc(101, 7)) }).expect(413)
      const saved = await row(id)
      expect(saved.ydocRevision).toBe(1)
      await store(id, input({ ydoc: b64(Buffer.alloc(100, 7)) })).expect(204)
      delete process.env.COLLAB_MAX_DOC_BYTES
    })

    it("answers 404 when the page was deleted, and does not bring it back", async () => {
      const id = await mkPage()
      await prisma.page.delete({ where: { id } })
      await store(id, input()).expect(404)
      expect(await prisma.page.findUnique({ where: { id } })).toBeNull()
    })

    it("rejects a malformed request with 400", async () => {
      const id = await mkPage()
      await store(id, { ydoc: b64([1]), fields: { title: "t" }, editors: [] }).expect(400)
      await store(id, { ydoc: b64([1]), fields: { body: doc("x"), title: "t" }, editors: "nobody" }).expect(400)
      await store(id, { fields: { body: doc("x"), title: "t" }, editors: [] }).expect(400)
      await store(id, input({ fields: { body: doc("x"), title: 42 } })).expect(400)
      await store(id, input({ fields: { body: "not an object", title: "t" } })).expect(400)
    })
  })
})
