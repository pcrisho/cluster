import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

describe("Page ydoc column", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let manager: TestActor
  let pageId: string

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    const http = request(app.getHttpServer())
    manager = await createActor(app, "ydoc-mgr", "MANAGER")
    await prisma.userCapability.create({
      data: { userId: manager.id, capability: "KNOW_SPACE_CREATE", grantedById: manager.id },
    })
    const space = await http
      .post("/api/v1/know/spaces")
      .set(manager.auth)
      .send({ name: "Ydoc space", icon: "book-open" })
      .expect(201)
    const page = await http
      .post(`/api/v1/know/spaces/${space.body.data.id}/pages`)
      .set(manager.auth)
      .send({ title: "Ydoc page" })
      .expect(201)
    pageId = page.body.data.id
    await prisma.page.update({
      where: { id: pageId },
      data: { ydoc: Buffer.from([1, 2, 3]), ydocRevision: 1 },
    })
  })

  afterAll(async () => app?.close())

  it("never serializes ydoc through the REST API", async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/know/pages/${pageId}`)
      .set(manager.auth)
      .expect(200)
    expect(JSON.stringify(res.body)).not.toMatch(/"ydoc"/)
  })

  it("omits ydoc from queries unless asked for", async () => {
    const plain = await prisma.page.findUnique({ where: { id: pageId } })
    expect(plain).not.toHaveProperty("ydoc")
    const withDoc = await prisma.page.findUnique({ where: { id: pageId }, omit: { ydoc: false } })
    expect([...(withDoc!.ydoc as Uint8Array)]).toEqual([1, 2, 3])
    expect(withDoc!.ydocRevision).toBe(1)
  })

  it("clears lastEditedById when the editor is deleted", async () => {
    const editor = await createActor(app, "ydoc-editor", "COLLABORATOR", manager.orgId)
    await prisma.page.update({ where: { id: pageId }, data: { lastEditedById: editor.id } })
    await prisma.user.delete({ where: { id: editor.id } })
    const page = await prisma.page.findUniqueOrThrow({ where: { id: pageId } })
    expect(page.lastEditedById).toBeNull()
  })
})
