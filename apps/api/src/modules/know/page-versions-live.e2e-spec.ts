import { INestApplication } from "@nestjs/common"
import { createServer, Server } from "http"
import { AddressInfo } from "net"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

const SECRET = "test-collab-secret-".repeat(4)
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

/**
 * "Save version" and "Restore" on a page that has a live document. A fake collab stands in for the
 * real one: `flush` writes what people typed since the last save, `replace` writes the new body.
 */
describe("KNOW page versions on the live document e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  let collab: Server
  let calls: { path: string; body: Record<string, unknown> }[]
  let typedSinceSave: Record<string, unknown> // pageId → content collab has but the row does not
  const previous = { url: process.env.COLLAB_URL, secret: process.env.COLLAB_INTERNAL_SECRET }

  let admin: TestActor
  let viewer: TestActor
  let space: string

  const mkPage = async (live: boolean, text = "saved") => {
    const page = await prisma.page.create({
      data: {
        spaceId: space,
        title: "live",
        status: "PUBLISHED",
        icon: "file-text",
        authorId: admin.id,
        content: doc(text),
        searchText: text,
        ...(live && { ydoc: Buffer.from([0]), ydocRevision: 1 }),
      },
    })
    return page.id
  }
  const versions = (pageId: string) =>
    prisma.pageVersion.findMany({ where: { pageId }, orderBy: { version: "asc" } })
  const pageUrl = (pageId: string, tail: string) => `/api/v1/know/pages/${pageId}${tail}`

  beforeAll(async () => {
    typedSinceSave = {}
    collab = createServer((req, res) => {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", async () => {
        const body = JSON.parse(raw)
        calls.push({ path: req.url!, body })
        const pageId = String(body.documentName ?? "").split(":")[1]
        if (req.url === "/control/flush" && pageId in typedSinceSave) {
          const content = typedSinceSave[pageId] as object
          await prisma.page.update({ where: { id: pageId }, data: { content, searchText: "typed" } })
          delete typedSinceSave[pageId]
        }
        if (req.url === "/control/replace")
          await prisma.page.update({ where: { id: pageId }, data: { content: body.body, searchText: "restored" } })
        res.writeHead(200).end("{}")
      })
    })
    await new Promise<void>((resolve) => collab.listen(0, "127.0.0.1", resolve))
    process.env.COLLAB_URL = `http://127.0.0.1:${(collab.address() as AddressInfo).port}`
    process.env.COLLAB_INTERNAL_SECRET = SECRET

    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    admin = await createActor(app, "pv-admin", "ADMIN")
    viewer = await createActor(app, "pv-viewer", "COLLABORATOR", admin.orgId)
    space = (await prisma.space.create({ data: { name: "Versions live", restricted: false, organizationId: admin.orgId, createdBy: admin.id } })).id
  })

  beforeEach(() => {
    calls = []
  })

  afterAll(async () => {
    for (const [key, value] of [["COLLAB_URL", previous.url], ["COLLAB_INTERNAL_SECRET", previous.secret]] as const) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    await app?.close()
    await new Promise((resolve) => collab.close(resolve))
  })

  describe("a page that was never opened in live editing", () => {
    it("saves versions and restores through REST without calling collab", async () => {
      const page = await mkPage(false, "before")
      const first = await http.post(pageUrl(page, "/versions")).set(admin.auth).expect(201)
      await prisma.page.update({ where: { id: page }, data: { content: doc("after") } })

      await http.post(pageUrl(page, `/restore/${first.body.data.id}`)).set(admin.auth).expect(201)

      expect(calls).toEqual([])
      expect((await prisma.page.findUniqueOrThrow({ where: { id: page } })).content).toEqual(doc("before"))
      // restoring keeps what was there as a version, so it can be undone
      expect((await versions(page)).map((v) => v.content)).toEqual([doc("before"), doc("after")])
    })
  })

  describe("a page with a live document", () => {
    it("Save version asks collab to save first, so the version holds what was just typed", async () => {
      const page = await mkPage(true, "saved")
      typedSinceSave[page] = doc("typed a second ago")

      const res = await http.post(pageUrl(page, "/versions")).set(admin.auth).expect(201)

      expect(calls).toEqual([{ path: "/control/flush", body: { documentName: `know.page:${page}` } }])
      expect(res.body.data.content).toEqual(doc("typed a second ago"))
      expect((await versions(page)).map((v) => v.content)).toEqual([doc("typed a second ago")])
    })

    it("Restore keeps the live state as a version, then replaces the live body", async () => {
      const page = await mkPage(true, "old")
      const old = await http.post(pageUrl(page, "/versions")).set(admin.auth).expect(201)
      typedSinceSave[page] = doc("written since")
      calls = []

      const res = await http.post(pageUrl(page, `/restore/${old.body.data.id}`)).set(admin.auth).expect(201)

      expect(calls.map((c) => c.path)).toEqual(["/control/flush", "/control/replace"])
      expect(calls[1].body).toEqual({ documentName: `know.page:${page}`, body: doc("old") })
      expect(res.body.data.content).toEqual(doc("old"))
      expect((await versions(page)).map((v) => v.content)).toEqual([doc("old"), doc("written since")])
    })

    it("answers 503 and changes nothing while collab is down", async () => {
      const page = await mkPage(true, "old")
      const old = await http.post(pageUrl(page, "/versions")).set(admin.auth).expect(201)
      const real = process.env.COLLAB_URL
      process.env.COLLAB_URL = "http://127.0.0.1:1"
      try {
        await http.post(pageUrl(page, "/versions")).set(admin.auth).expect(503)
        await http.post(pageUrl(page, `/restore/${old.body.data.id}`)).set(admin.auth).expect(503)
      } finally {
        process.env.COLLAB_URL = real
      }
      expect(await versions(page)).toHaveLength(1)
      expect((await prisma.page.findUniqueOrThrow({ where: { id: page } })).content).toEqual(doc("old"))
    })

    it("only editors can: a viewer gets 403 and collab is not called", async () => {
      const page = await mkPage(true)
      const mine = await prisma.pageVersion.create({
        data: { pageId: page, title: "v", content: doc("v"), authorId: admin.id, version: 1 },
      })
      await http.post(pageUrl(page, "/versions")).set(viewer.auth).expect(403)
      await http.post(pageUrl(page, `/restore/${mine.id}`)).set(viewer.auth).expect(403)
      expect(calls).toEqual([])
    })
  })
})
