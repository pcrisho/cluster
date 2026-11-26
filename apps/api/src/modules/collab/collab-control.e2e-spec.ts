import { INestApplication } from "@nestjs/common"
import { createServer, Server } from "http"
import { AddressInfo } from "net"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

const SECRET = "test-collab-secret-".repeat(4)
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }

interface Call {
  path: string
  secret: string | undefined
  body: unknown
}

/** What the API tells the collab service when access to KNOW pages changes (a fake collab records it). */
describe("API → collab control calls e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  let collab: Server
  let calls: Call[]
  const previous = { url: process.env.COLLAB_URL, secret: process.env.COLLAB_INTERNAL_SECRET }

  let admin: TestActor
  let member: TestActor
  let space: string

  const mkPage = (status: "PUBLISHED" | "DRAFT" = "PUBLISHED", spaceId = space) =>
    prisma.page
      .create({
        data: { spaceId, title: "p", status, icon: "file-text", authorId: admin.id, content: doc, searchText: "x" },
      })
      .then((p) => p.id)
  const mkSpace = (restricted = true) =>
    prisma.space
      .create({ data: { name: `s-${Math.random()}`, restricted, organizationId: admin.orgId, createdBy: admin.id } })
      .then((s) => s.id)
  const sent = (path: string) => calls.filter((c) => c.path === path).map((c) => c.body)

  beforeAll(async () => {
    collab = createServer((req, res) => {
      let raw = ""
      req.on("data", (chunk) => (raw += chunk))
      req.on("end", () => {
        calls.push({ path: req.url!, secret: req.headers["x-collab-secret"] as string, body: JSON.parse(raw) })
        res.writeHead(202).end("{}")
      })
    })
    await new Promise<void>((resolve) => collab.listen(0, "127.0.0.1", resolve))
    process.env.COLLAB_URL = `http://127.0.0.1:${(collab.address() as AddressInfo).port}`
    process.env.COLLAB_INTERNAL_SECRET = SECRET

    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    admin = await createActor(app, "cc-admin", "ADMIN")
    member = await createActor(app, "cc-member", "COLLABORATOR", admin.orgId)
    space = await mkSpace()
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

  describe("space access", () => {
    it("adding, changing and removing an entry rechecks every open connection, with the secret", async () => {
      const added = await http
        .post(`/api/v1/know/spaces/${space}/access`)
        .set(admin.auth)
        .send({ principalType: "USER", principalId: member.id, role: "VIEWER" })
        .expect(201)
      const entry = added.body.id
      await http.patch(`/api/v1/know/spaces/${space}/access/${entry}`).set(admin.auth).send({ role: "EDITOR" }).expect(200)
      await http.delete(`/api/v1/know/spaces/${space}/access/${entry}`).set(admin.auth).expect(204)

      expect(sent("/control/recheck")).toEqual([{ scope: "all" }, { scope: "all" }, { scope: "all" }])
      expect(calls.every((c) => c.secret === SECRET)).toBe(true)
    })

    it("making a space restricted rechecks; renaming it does not", async () => {
      const open = await mkSpace(false)
      await http.patch(`/api/v1/know/spaces/${open}`).set(admin.auth).send({ name: "Renamed" }).expect(200)
      expect(calls).toEqual([])
      await http.patch(`/api/v1/know/spaces/${open}`).set(admin.auth).send({ restricted: true }).expect(200)
      expect(sent("/control/recheck")).toEqual([{ scope: "all" }])
    })
  })

  describe("pages", () => {
    it("changing the status rechecks that page", async () => {
      const page = await mkPage()
      await http.patch(`/api/v1/know/pages/${page}/status`).set(admin.auth).send({ status: "DRAFT" }).expect(200)
      await http.patch(`/api/v1/know/pages/${page}`).set(admin.auth).send({ status: "ARCHIVED" }).expect(200)
      expect(sent("/control/recheck")).toEqual([
        { scope: "page", id: page },
        { scope: "page", id: page },
      ])
    })

    it("deleting a page closes its document", async () => {
      const page = await mkPage()
      await http.delete(`/api/v1/know/pages/${page}`).set(admin.auth).expect(200)
      expect(sent("/control/close")).toEqual([{ documentName: `know.page:${page}` }])
    })

    it("deleting a space closes the documents of its pages that have been opened live, and only those", async () => {
      const doomed = await mkSpace()
      const live = [await mkPage("PUBLISHED", doomed), await mkPage("DRAFT", doomed)]
      for (const id of live)
        await prisma.page.update({ where: { id }, data: { ydoc: Buffer.from([0]), ydocRevision: 1 } })
      await mkPage("PUBLISHED", doomed) // never opened in live editing: nothing to close

      await http.delete(`/api/v1/know/spaces/${doomed}`).set(admin.auth).expect(200)

      expect(sent("/control/close")).toHaveLength(2)
      expect(sent("/control/close")).toEqual(
        expect.arrayContaining(live.map((id) => ({ documentName: `know.page:${id}` }))),
      )
    })

    it("deleting a space closes its live description only when it was opened live", async () => {
      const [opened, never] = [await mkSpace(), await mkSpace()]
      await prisma.space.update({ where: { id: opened }, data: { ydoc: Buffer.from([0]), ydocRevision: 1 } })

      await http.delete(`/api/v1/know/spaces/${never}`).set(admin.auth).expect(200)
      expect(sent("/control/close")).toEqual([])
      await http.delete(`/api/v1/know/spaces/${opened}`).set(admin.auth).expect(200)
      expect(sent("/control/close")).toEqual([{ documentName: `know.space:${opened}` }])
    })
  })

  describe("organization", () => {
    it("changing a member's role or deactivating them rechecks that user", async () => {
      await http.patch(`/api/v1/org/members/${member.id}`).set(admin.auth).send({ role: "MANAGER" }).expect(200)
      await http.patch(`/api/v1/org/members/${member.id}`).set(admin.auth).send({ isActive: false }).expect(200)
      expect(sent("/control/recheck")).toEqual([
        { scope: "user", id: member.id },
        { scope: "user", id: member.id },
      ])
    })

    it("assigning an area rechecks that user; moving or archiving an area rechecks everyone", async () => {
      const person = await createActor(app, "cc-person", "COLLABORATOR", admin.orgId)
      const mkArea = (name: string) =>
        prisma.orgNode.create({ data: { name, organizationId: admin.orgId } }).then((n) => n.id)
      const [parent, child, spare] = [await mkArea("A"), await mkArea("B"), await mkArea("C")]

      await http.patch(`/api/v1/org/members/${person.id}/assignment`).set(admin.auth).send({ orgNodeId: child }).expect(200)
      expect(sent("/control/recheck")).toEqual([{ scope: "user", id: person.id }])

      calls = []
      await http.patch(`/api/v1/org/areas/${child}/move`).set(admin.auth).send({ newParentId: parent }).expect(200)
      await http.delete(`/api/v1/org/areas/${child}?reassignTo=${spare}`).set(admin.auth).expect(200)
      expect(sent("/control/recheck")).toEqual([{ scope: "all" }, { scope: "all" }])
    })
  })

  describe("when collab does not answer", () => {
    it("the user's action still succeeds", async () => {
      const real = process.env.COLLAB_URL
      process.env.COLLAB_URL = "http://127.0.0.1:1" // nothing listens here
      try {
        const page = await mkPage()
        await http.patch(`/api/v1/know/pages/${page}/status`).set(admin.auth).send({ status: "DRAFT" }).expect(200)
        await http.delete(`/api/v1/know/pages/${page}`).set(admin.auth).expect(200)
        expect(await prisma.page.findUnique({ where: { id: page } })).toBeNull()
      } finally {
        process.env.COLLAB_URL = real
      }
    })

    it("and so does it when the secret is not configured", async () => {
      delete process.env.COLLAB_INTERNAL_SECRET
      try {
        const page = await mkPage()
        await http.patch(`/api/v1/know/pages/${page}/status`).set(admin.auth).send({ status: "DRAFT" }).expect(200)
        expect(calls).toEqual([])
      } finally {
        process.env.COLLAB_INTERNAL_SECRET = SECRET
      }
    })
  })
})
