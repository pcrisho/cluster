import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

const PDF = Buffer.from("%PDF-1.4\nsecret\n")
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

/**
 * Who can read and change what: open spaces are readable by the whole organization, restricted ones only by
 * ADMIN and by people an entry points at (themselves, their area or an area above it, their position).
 */
describe("KNOW access e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>

  let admin: TestActor
  let orgManager: TestActor // MANAGER role in the organization, no entries
  let viewer: TestActor // user entry VIEWER
  let editor: TestActor // user entry EDITOR
  let inSubArea: TestActor // area entry on the parent area
  let inspector: TestActor // position entry
  let outsider: TestActor // COLLABORATOR without entries
  let spaceManager: TestActor // COLLABORATOR with a MANAGER user entry
  let creator: TestActor // MANAGER role, capability KNOW_SPACE_CREATE
  let deleter: TestActor // MANAGER entry on the secret space + KNOW_SPACE_DELETE
  let capOnly: TestActor // KNOW_SPACE_DELETE but only an EDITOR entry
  let otherOrgAdmin: TestActor

  let openSpace: string
  let secretSpace: string
  let secretPublished: string
  let secretDraft: string
  let openPublished: string
  let publishedDoc: { id: string; versionId: string }
  let draftDoc: { id: string; versionId: string }

  const api = (p: string) => `/api/v1/know${p}`
  const get = (a: TestActor, p: string) => http.get(api(p)).set(a.auth)

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())

    admin = await createActor(app, "acc-admin", "ADMIN")
    const org = admin.orgId
    orgManager = await createActor(app, "acc-mgr", "MANAGER", org)
    viewer = await createActor(app, "acc-viewer", "COLLABORATOR", org)
    editor = await createActor(app, "acc-editor", "COLLABORATOR", org)
    inSubArea = await createActor(app, "acc-area", "COLLABORATOR", org)
    inspector = await createActor(app, "acc-pos", "COLLABORATOR", org)
    outsider = await createActor(app, "acc-out", "COLLABORATOR", org)
    spaceManager = await createActor(app, "acc-spmgr", "COLLABORATOR", org)
    creator = await createActor(app, "acc-creator", "MANAGER", org)
    deleter = await createActor(app, "acc-deleter", "COLLABORATOR", org)
    capOnly = await createActor(app, "acc-caponly", "COLLABORATOR", org)
    otherOrgAdmin = await createActor(app, "acc-other", "ADMIN")

    const ops = await prisma.orgNode.create({ data: { name: "Ops", organizationId: org } })
    const safety = await prisma.orgNode.create({ data: { name: "Safety", organizationId: org, parentId: ops.id } })
    const position = await prisma.position.create({
      data: { name: "Inspector", organizationId: org, createdById: admin.id },
    })
    await prisma.userProfile.create({ data: { userId: inSubArea.id, orgNodeId: safety.id } })
    await prisma.userProfile.create({ data: { userId: inspector.id, positionId: position.id } })

    const mkSpace = (name: string, restricted: boolean) =>
      prisma.space.create({ data: { name, restricted, organizationId: org, createdBy: admin.id } }).then((s) => s.id)
    openSpace = await mkSpace("Open", false)
    secretSpace = await mkSpace("Secret", true)

    const entry = (data: object) => prisma.spaceAccess.create({ data: { spaceId: secretSpace, createdById: admin.id, ...data } as never })
    await entry({ userId: viewer.id, role: "VIEWER" })
    await entry({ userId: editor.id, role: "EDITOR" })
    await entry({ orgNodeId: ops.id, role: "EDITOR" })
    await entry({ positionId: position.id, role: "VIEWER" })
    await entry({ userId: spaceManager.id, role: "MANAGER" })
    await entry({ userId: deleter.id, role: "MANAGER" })
    await entry({ userId: capOnly.id, role: "EDITOR" })
    const grant = (userId: string, capability: "KNOW_SPACE_CREATE" | "KNOW_SPACE_DELETE") =>
      prisma.userCapability.create({ data: { userId, capability, grantedById: admin.id } })
    await grant(creator.id, "KNOW_SPACE_CREATE")
    await grant(deleter.id, "KNOW_SPACE_DELETE")
    await grant(capOnly.id, "KNOW_SPACE_DELETE")

    const mkPage = (spaceId: string, title: string, status: "PUBLISHED" | "DRAFT", text: string) =>
      prisma.page
        .create({
          data: { spaceId, title, status, authorId: admin.id, content: doc(text), searchText: text, publishedAt: status === "PUBLISHED" ? new Date() : null },
        })
        .then((p) => p.id)
    openPublished = await mkPage(openSpace, "Open page", "PUBLISHED", "kiwi open")
    secretPublished = await mkPage(secretSpace, "Secret page", "PUBLISHED", "kiwi secret")
    secretDraft = await mkPage(secretSpace, "Secret draft", "DRAFT", "kiwi draft")

    const addDoc = async (pageId: string) => {
      const res = await http
        .post(api(`/pages/${pageId}/documents`))
        .set(admin.auth)
        .attach("file", PDF, { filename: "a.pdf", contentType: "application/pdf" })
        .expect(201)
      return { id: res.body.data.id as string, versionId: res.body.data.currentVersion.id as string }
    }
    publishedDoc = await addDoc(secretPublished)
    draftDoc = await addDoc(secretDraft)
  })

  afterAll(async () => app?.close())

  // it.each tables are built before beforeAll runs, so they name the actors and resolve them lazily.
  const actor: Record<string, () => TestActor> = {
    admin: () => admin,
    "user entry (viewer)": () => viewer,
    "user entry (editor)": () => editor,
    "area entry, user in a sub-area": () => inSubArea,
    "position entry": () => inspector,
    "organization MANAGER without entries": () => orgManager,
    "collaborator without entries": () => outsider,
    "admin of another organization": () => otherOrgAdmin,
  }
  const insiders = ["admin", "user entry (viewer)", "user entry (editor)", "area entry, user in a sub-area", "position entry"]
  const outsiders = ["organization MANAGER without entries", "collaborator without entries", "admin of another organization"]

  describe("restricted space", () => {
    it.each(insiders)("%s can read it", async (name) => {
      const who = actor[name]()
      await get(who, `/spaces/${secretSpace}`).expect(200)
      await get(who, `/spaces/${secretSpace}/pages`).expect(200)
      await get(who, `/pages/${secretPublished}`).expect(200)
      await get(who, `/pages/${secretPublished}/documents`).expect(200)
    })

    it.each(outsiders)("%s sees nothing of it", async (name) => {
      const who = actor[name]()
      await get(who, `/spaces/${secretSpace}`).expect(404)
      await get(who, `/spaces/${secretSpace}/pages`).expect(404)
      await get(who, `/pages/${secretPublished}`).expect(404)
      await get(who, `/pages/${secretPublished}/documents`).expect(404)
      await get(who, `/documents/${publishedDoc.id}/versions`).expect(404)
      await get(who, `/documents/${publishedDoc.id}/versions/${publishedDoc.versionId}/download`).expect(404)
    })

    it("is left out of the space list for people without access", async () => {
      const ids = async (who: TestActor) => (await get(who, "/spaces").expect(200)).body.data.map((s: { id: string }) => s.id)
      expect(await ids(admin)).toEqual(expect.arrayContaining([openSpace, secretSpace]))
      expect(await ids(viewer)).toEqual(expect.arrayContaining([openSpace, secretSpace]))
      expect(await ids(inSubArea)).toContain(secretSpace)
      expect(await ids(inspector)).toContain(secretSpace)
      for (const who of [orgManager, outsider]) {
        const list = await ids(who)
        expect(list).toContain(openSpace)
        expect(list).not.toContain(secretSpace)
      }
    })

    it("is left out of search and mention search for people without access", async () => {
      const found = async (who: TestActor, path: string) => JSON.stringify((await get(who, path).expect(200)).body)
      for (const who of [orgManager, outsider]) {
        expect(await found(who, "/search?q=kiwi")).not.toContain(secretPublished)
        expect(await found(who, "/pages/search?q=Secret")).not.toContain(secretPublished)
        expect(await found(who, `/pages/search?q=Secret&spaceId=${secretSpace}`)).not.toContain(secretPublished)
      }
      expect(await found(viewer, "/search?q=kiwi")).toContain(secretPublished)
    })
  })

  describe("open space", () => {
    it("is readable by every member of the organization, and by nobody outside it", async () => {
      for (const who of [admin, orgManager, outsider, viewer]) {
        await get(who, `/spaces/${openSpace}`).expect(200)
        await get(who, `/pages/${openPublished}`).expect(200)
      }
      await get(otherOrgAdmin, `/spaces/${openSpace}`).expect(404)
    })
  })

  describe("drafts", () => {
    it("are visible only to editors of the space (and ADMIN)", async () => {
      for (const who of [admin, editor, inSubArea]) {
        await get(who, `/pages/${secretDraft}`).expect(200)
        await get(who, `/pages/${secretDraft}/documents`).expect(200)
        await get(who, `/documents/${draftDoc.id}/versions`).expect(200)
      }
      for (const who of [viewer, inspector]) {
        await get(who, `/pages/${secretDraft}`).expect(404)
        await get(who, `/pages/${secretDraft}/documents`).expect(404)
        await get(who, `/documents/${draftDoc.id}/versions`).expect(404)
        await get(who, `/documents/${draftDoc.id}/versions/${draftDoc.versionId}/download`).expect(404)
      }
    })

    it("are left out of the page tree, search and mentions for viewers", async () => {
      const titles = async (who: TestActor, path: string) => (await get(who, path).expect(200)).body.data.map((p: { title: string }) => p.title)
      expect(await titles(viewer, `/spaces/${secretSpace}/pages`)).toEqual(["Secret page"])
      expect(await titles(editor, `/spaces/${secretSpace}/pages`)).toEqual(expect.arrayContaining(["Secret page", "Secret draft"]))
      const viewerHits = await titles(viewer, "/search?q=kiwi")
      expect(viewerHits).toEqual(expect.arrayContaining(["Secret page", "Open page"]))
      expect(viewerHits).not.toContain("Secret draft")
      expect(await titles(editor, "/search?q=kiwi")).toContain("Secret draft")
      expect(await titles(viewer, "/pages/search?q=Secret")).toEqual(["Secret page"])
    })
  })

  describe("role reported to the client", () => {
    it("tells each person their own role in the space", async () => {
      const role = async (who: TestActor, space: string) => (await get(who, `/spaces/${space}`).expect(200)).body.data.myRole
      expect(await role(admin, secretSpace)).toBe("MANAGER")
      expect(await role(viewer, secretSpace)).toBe("VIEWER")
      expect(await role(editor, secretSpace)).toBe("EDITOR")
      expect(await role(inSubArea, secretSpace)).toBe("EDITOR")
      expect(await role(inspector, secretSpace)).toBe("VIEWER")
      expect(await role(outsider, openSpace)).toBe("VIEWER")
    })

    it("includes it in the space list and the page", async () => {
      const list = (await get(editor, "/spaces").expect(200)).body.data
      expect(list.find((s: { id: string }) => s.id === secretSpace).myRole).toBe("EDITOR")
      expect(list.find((s: { id: string }) => s.id === openSpace).myRole).toBe("VIEWER")
      const page = (await get(viewer, `/pages/${secretPublished}`).expect(200)).body.data
      expect(page.space.myRole).toBe("VIEWER")
    })
  })

  describe("version history", () => {
    it("is for editors; viewers can read the page but not its history", async () => {
      await get(editor, `/pages/${secretPublished}/versions`).expect(200)
      await get(viewer, `/pages/${secretPublished}/versions`).expect(403)
      const versionId = (await send("post", editor, `/pages/${secretPublished}/versions`).expect(201)).body.data.id
      await get(editor, `/pages/${secretPublished}/versions/${versionId}`).expect(200)
      await get(viewer, `/pages/${secretPublished}/versions/${versionId}`).expect(403)
      await get(outsider, `/pages/${secretPublished}/versions`).expect(404)
    })
  })

  // ── Writing ─────────────────────────────────────────────────────────────────

  const send = (method: "post" | "patch" | "delete", who: TestActor, path: string, body: object = {}) =>
    http[method](api(path)).set(who.auth).send(body)
  const newPage = async (space: string) =>
    (await send("post", admin, `/spaces/${space}/pages`, { title: `p-${Math.random()}` }).expect(201)).body.data.id as string

  describe("writing pages and documents", () => {
    it.each([
      ["admin", 201],
      ["user entry (editor)", 201],
      ["area entry, user in a sub-area", 201],
      ["user entry (viewer)", 403],
      ["position entry", 403],
      ["organization MANAGER without entries", 404],
      ["collaborator without entries", 404],
      ["admin of another organization", 404],
    ])("%s creating a page in the restricted space: %s", async (name, status) => {
      const res = await send("post", actor[name](), `/spaces/${secretSpace}/pages`, { title: "new" })
      expect(res.status).toBe(status)
    })

    it("an organization MANAGER or collaborator without entries cannot write in an open space either", async () => {
      for (const who of [orgManager, outsider, viewer]) {
        await send("post", who, `/spaces/${openSpace}/pages`, { title: "nope" }).expect(403)
      }
      await send("post", admin, `/spaces/${openSpace}/pages`, { title: "admin writes" }).expect(201)
    })

    it("editors change, publish, version and delete pages; viewers cannot", async () => {
      const page = await newPage(secretSpace)
      await send("patch", viewer, `/pages/${page}/status`, { status: "ARCHIVED" }).expect(403)
      await send("patch", editor, `/pages/${page}`, { iconType: "LUCIDE" }).expect(200)
      await send("patch", editor, `/pages/${page}/status`, { status: "PUBLISHED" }).expect(200)
      await send("patch", viewer, `/pages/${page}`, { iconType: "LUCIDE" }).expect(403)
      await send("patch", viewer, `/pages/${page}/move`, { parentId: null, index: 0 }).expect(403)
      await send("patch", editor, `/pages/${page}/move`, { parentId: null, index: 0 }).expect(200)
      await send("post", viewer, `/pages/${page}/versions`).expect(403)
      await send("post", editor, `/pages/${page}/versions`).expect(201)
      await send("delete", viewer, `/pages/${page}`).expect(403)
      await send("delete", editor, `/pages/${page}`).expect(200)
    })

    it("markdown: viewers can export a published page but not import; editors import drafts", async () => {
      const page = await newPage(secretSpace)
      await get(viewer, `/pages/${page}/export`).expect(200)
      await send("post", viewer, `/spaces/${secretSpace}/pages/import`, { markdown: "# x" }).expect(403)
      await send("post", editor, `/spaces/${secretSpace}/pages/import`, { markdown: "# x" }).expect(201)
      await send("post", editor, `/spaces/${openSpace}/pages/import`, { markdown: "# x" }).expect(403)
      await get(outsider, `/pages/${page}/export`).expect(404)
    })

    it("an editor of one space cannot write in another", async () => {
      const elsewhere = await newPage(openSpace)
      await send("patch", editor, `/pages/${elsewhere}`, { iconType: "LUCIDE" }).expect(403)
      await send("patch", editor, `/pages/${elsewhere}/move`, { parentId: null, index: 0 }).expect(403)
      await send("post", editor, `/spaces/${openSpace}/pages`, { title: "x" }).expect(403)
    })

    it("documents follow the page: editors upload, replace and delete; viewers cannot", async () => {
      const page = await newPage(secretSpace)
      await send("patch", admin, `/pages/${page}/status`, { status: "PUBLISHED" }).expect(200)
      const upload = (who: TestActor) =>
        http.post(api(`/pages/${page}/documents`)).set(who.auth).attach("file", PDF, { filename: "a.pdf", contentType: "application/pdf" })
      await upload(viewer).expect(403)
      await upload(outsider).expect(404)
      const created = await upload(editor).expect(201)
      const id = created.body.data.id as string
      const version = (who: TestActor) =>
        http.post(api(`/documents/${id}/versions`)).set(who.auth).attach("file", PDF, { filename: "b.pdf", contentType: "application/pdf" })
      await version(viewer).expect(403)
      await version(editor).expect(201)
      await send("post", viewer, `/documents/${id}/versions/${created.body.data.currentVersion.id}/restore`).expect(403)
      await send("delete", viewer, `/documents/${id}`).expect(403)
      await send("delete", outsider, `/documents/${id}`).expect(404)
      await send("delete", editor, `/documents/${id}`).expect(204)
    })

    it("inline images need editor on the space", async () => {
      const page = await newPage(secretSpace)
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64")
      const put = (who: TestActor) => http.post(api(`/pages/${page}/images`)).set(who.auth).attach("file", png, { filename: "a.png", contentType: "image/png" })
      await put(viewer).expect(403)
      await put(editor).expect(201)
    })
  })

  describe("space settings and access", () => {
    it("only managers of the space and ADMIN change its settings", async () => {
      await send("patch", editor, `/spaces/${secretSpace}`, { name: "Renamed by editor" }).expect(403)
      await send("patch", viewer, `/spaces/${secretSpace}`, { name: "x" }).expect(403)
      await send("patch", outsider, `/spaces/${secretSpace}`, { name: "x" }).expect(404)
      await send("patch", spaceManager, `/spaces/${secretSpace}`, { name: "Secret" }).expect(200)
      await send("patch", admin, `/spaces/${secretSpace}`, { name: "Secret" }).expect(200)
    })

    it("a manager can restrict or open the space", async () => {
      const space = (await send("post", creator, "/spaces", { name: "Toggle", icon: "book-open" }).expect(201)).body.data.id
      const patch = (restricted: boolean) => send("patch", creator, `/spaces/${space}`, { restricted })
      expect((await patch(true).expect(200)).body.data.restricted).toBe(true)
      await get(outsider, `/spaces/${space}`).expect(404)
      expect((await patch(false).expect(200)).body.data.restricted).toBe(false)
      await get(outsider, `/spaces/${space}`).expect(200)
    })
  })

  describe("creating and deleting spaces", () => {
    it("needs ADMIN or the create capability; the creator manages the new space", async () => {
      await send("post", orgManager, "/spaces", { name: "Nope", icon: "book-open" }).expect(403)
      await send("post", editor, "/spaces", { name: "Nope", icon: "book-open" }).expect(403)
      const created = await send("post", creator, "/spaces", { name: "Mine", icon: "book-open", restricted: true }).expect(201)
      expect(created.body.data).toMatchObject({ restricted: true, myRole: "MANAGER" })
      await get(creator, `/spaces/${created.body.data.id}`).expect(200)
      await get(outsider, `/spaces/${created.body.data.id}`).expect(404)
      await send("post", admin, "/spaces", { name: "Admin's", icon: "book-open" }).expect(201)
    })

    it("deleting needs ADMIN, or manager of the space plus the delete capability", async () => {
      const make = async () => {
        const id = (await send("post", admin, "/spaces", { name: "To delete", icon: "book-open", restricted: true }).expect(201)).body.data.id as string
        for (const [who, role] of [[deleter, "MANAGER"], [capOnly, "EDITOR"], [spaceManager, "MANAGER"]] as const) {
          await prisma.spaceAccess.create({ data: { spaceId: id, userId: who.id, role, createdById: admin.id } })
        }
        return id
      }
      const target = await make()
      await send("delete", spaceManager, `/spaces/${target}`).expect(403) // manager, no capability
      await send("delete", capOnly, `/spaces/${target}`).expect(403) // capability, only editor
      await send("delete", outsider, `/spaces/${target}`).expect(404)
      await send("delete", deleter, `/spaces/${target}`).expect(200)
      await send("delete", admin, `/spaces/${await make()}`).expect(200)
      await send("delete", capOnly, `/spaces/${openSpace}`).expect(403) // capability, no role in an open space
    })
  })

  describe("tags", () => {
    it("editors of any space create tags; only ADMIN deletes them; everyone in the organization lists them", async () => {
      await send("post", viewer, "/tags", { name: "viewer-tag" }).expect(403)
      await send("post", outsider, "/tags", { name: "outsider-tag" }).expect(403)
      const tag = (await send("post", editor, "/tags", { name: "editor-tag" }).expect(201)).body.data.id as string
      expect(JSON.stringify((await get(outsider, "/tags").expect(200)).body)).toContain(tag)
      await send("delete", editor, `/tags/${tag}`).expect(403)
      await send("delete", otherOrgAdmin, `/tags/${tag}`).expect(404)
      await send("delete", admin, `/tags/${tag}`).expect(200)
    })
  })
})
