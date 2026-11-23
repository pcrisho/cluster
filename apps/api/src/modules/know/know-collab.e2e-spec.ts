import { INestApplication } from "@nestjs/common"
import { randomUUID } from "crypto"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

const SECRET = "test-collab-secret-".repeat(4)
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

/** Who may open a KNOW page in the collaborative editor, through the internal authorize endpoints. */
describe("KNOW collab authorization e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  let previousSecret: string | undefined

  let admin: TestActor
  let editor: TestActor // user entry EDITOR on the restricted space
  let viewer: TestActor // user entry VIEWER on the restricted space
  let outsider: TestActor // COLLABORATOR without entries
  let otherOrgAdmin: TestActor
  let disabledOrgAdmin: TestActor // organization without KNOW

  let openSpace: string
  let restrictedSpace: string
  let openPage: string
  let restrictedPage: string
  let draftPage: string
  let archivedPage: string

  const authorizeUser = (userId: string, pageId: string) =>
    http
      .post("/api/v1/internal/collab/authorize-user")
      .set({ "X-Collab-Secret": SECRET })
      .send({ userId, documentName: `know.page:${pageId}` })

  beforeAll(async () => {
    previousSecret = process.env.COLLAB_INTERNAL_SECRET
    process.env.COLLAB_INTERNAL_SECRET = SECRET
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())

    admin = await createActor(app, "collab-admin", "ADMIN")
    const org = admin.orgId
    editor = await createActor(app, "collab-editor", "COLLABORATOR", org)
    viewer = await createActor(app, "collab-viewer", "COLLABORATOR", org)
    outsider = await createActor(app, "collab-out", "COLLABORATOR", org)
    otherOrgAdmin = await createActor(app, "collab-other", "ADMIN")

    const disabledOrg = await prisma.organization.create({
      data: {
        name: "Collab no KNOW",
        slug: `collab-no-know-${Date.now()}`,
        enabledModules: ["GROW", "CONNECT", "LIFE"],
      },
    })
    disabledOrgAdmin = await createActor(app, "collab-disabled", "ADMIN", disabledOrg.id)

    const mkSpace = (name: string, restricted: boolean, organizationId = org) =>
      prisma.space.create({ data: { name, restricted, organizationId, createdBy: admin.id } }).then((s) => s.id)
    openSpace = await mkSpace("Collab open", false)
    restrictedSpace = await mkSpace("Collab restricted", true)
    await prisma.spaceAccess.create({
      data: { spaceId: restrictedSpace, userId: editor.id, role: "EDITOR", createdById: admin.id },
    })
    await prisma.spaceAccess.create({
      data: { spaceId: restrictedSpace, userId: viewer.id, role: "VIEWER", createdById: admin.id },
    })

    const mkPage = (spaceId: string, title: string, status: "PUBLISHED" | "DRAFT" | "ARCHIVED") =>
      prisma.page
        .create({
          data: {
            spaceId,
            title,
            status,
            authorId: admin.id,
            content: doc(title),
            searchText: title,
            publishedAt: status === "PUBLISHED" ? new Date() : null,
          },
        })
        .then((p) => p.id)
    openPage = await mkPage(openSpace, "Open page", "PUBLISHED")
    restrictedPage = await mkPage(restrictedSpace, "Restricted page", "PUBLISHED")
    draftPage = await mkPage(restrictedSpace, "Restricted draft", "DRAFT")
    archivedPage = await mkPage(restrictedSpace, "Restricted archived", "ARCHIVED")
  })

  afterAll(async () => {
    if (previousSecret === undefined) delete process.env.COLLAB_INTERNAL_SECRET
    else process.env.COLLAB_INTERNAL_SECRET = previousSecret
    await app?.close()
  })

  it("gives WRITE to an organization ADMIN", async () => {
    const res = await authorizeUser(admin.id, restrictedPage).expect(200)
    expect(res.body.mode).toBe("WRITE")
    expect(res.body.userId).toBe(admin.id)
    expect(res.body.orgId).toBe(admin.orgId)
  })

  it("gives WRITE to an EDITOR of a restricted space", async () => {
    const res = await authorizeUser(editor.id, restrictedPage).expect(200)
    expect(res.body.mode).toBe("WRITE")
  })

  it("gives READ to a VIEWER of a restricted space", async () => {
    const res = await authorizeUser(viewer.id, restrictedPage).expect(200)
    expect(res.body.mode).toBe("READ")
  })

  it("gives READ to an implicit viewer of an open space", async () => {
    const res = await authorizeUser(outsider.id, openPage).expect(200)
    expect(res.body.mode).toBe("READ")
  })

  it("answers 404 for a restricted space the user has no entry in", async () => {
    await authorizeUser(outsider.id, restrictedPage).expect(404)
  })

  it("answers 404 for a draft to a viewer, and WRITE to an editor", async () => {
    await authorizeUser(viewer.id, draftPage).expect(404)
    const res = await authorizeUser(editor.id, draftPage).expect(200)
    expect(res.body.mode).toBe("WRITE")
  })

  it("answers 404 for an archived page to a viewer", async () => {
    await authorizeUser(viewer.id, archivedPage).expect(404)
  })

  it("answers 404 for a page of another organization, even to its ADMIN", async () => {
    await authorizeUser(otherOrgAdmin.id, restrictedPage).expect(404)
    await authorizeUser(otherOrgAdmin.id, openPage).expect(404)
  })

  it("answers an unknown page exactly like a page the user cannot read", async () => {
    const missing = await authorizeUser(outsider.id, randomUUID()).expect(404)
    const hidden = await authorizeUser(outsider.id, restrictedPage).expect(404)
    expect(missing.body).toEqual(hidden.body)
    expect(missing.body.message).toBe("Page not found")
  })

  it("answers 403 when the organization does not have the KNOW module", async () => {
    await authorizeUser(disabledOrgAdmin.id, openPage).expect(403)
  })

  it("chains the same rules for a JWT on /authorize", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/v1/internal/collab/authorize")
      .set({ "X-Collab-Secret": SECRET })
      .send({ token: editor.token, documentName: `know.page:${restrictedPage}` })
      .expect(200)
    expect(res.body.mode).toBe("WRITE")
    expect(res.body.userId).toBe(editor.id)
  })
})
