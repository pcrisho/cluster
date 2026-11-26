import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { StorageService } from "../storage/storage.service"
import { sweepOrphanImages } from "./orphan-images"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

describe("KNOW e2e", () => {
  let app: INestApplication
  let http: ReturnType<typeof request>
  let managerA: TestActor
  let managerB: TestActor
  let collabA: TestActor
  let spaceB: string
  let pageB: string
  let versionB: string

  const api = (p: string) => `/api/v1/know${p}`
  const mkSpace = async (a: TestActor, name: string) => {
    const res = await http.post(api("/spaces")).set(a.auth).send({ name, icon: "book-open" })
    if (res.status !== 201) throw new Error(`createSpace ${res.status} ${JSON.stringify(res.body)}`)
    return res.body.data.id as string
  }
  const PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
    "base64",
  )
  const addImage = async (pageId: string) =>
    (
      await http
        .post(api(`/pages/${pageId}/images`))
        .set(managerA.auth)
        .attach("file", PNG, { filename: "a.png", contentType: "image/png" })
        .expect(201)
    ).body.data.key as string
  const mkPage = async (a: TestActor, space: string, body: object = {}) => {
    const res = await http.post(api(`/spaces/${space}/pages`)).set(a.auth).send(body)
    expect(res.status).toBe(201)
    return res.body.data as { id: string; slug: string; publishedAt: string | null }
  }

  beforeAll(async () => {
    app = await createTestApp()
    http = request(app.getHttpServer())
    managerA = await createActor(app, "know-mgr-a", "MANAGER")
    await app.get(SystemPrismaService).userCapability.createMany({
      data: (["KNOW_SPACE_CREATE", "KNOW_SPACE_DELETE"] as const).map((capability) => ({
        userId: managerA.id,
        capability,
        grantedById: managerA.id,
      })),
    })
    collabA = await createActor(app, "know-col-a", "COLLABORATOR", managerA.orgId)
    managerB = await createActor(app, "know-mgr-b", "MANAGER")
    await app.get(SystemPrismaService).userCapability.create({
      data: { userId: managerB.id, capability: "KNOW_SPACE_CREATE", grantedById: managerB.id },
    })
    spaceB = await mkSpace(managerB, "Space B")
    pageB = (await mkPage(managerB, spaceB, { title: "Secret hello B" })).id
    versionB = (await http.post(api(`/pages/${pageB}/versions`)).set(managerB.auth).expect(201)).body.data.id
  })

  afterAll(async () => app?.close())

  describe("other organization cannot touch my data", () => {
    it.each([
      ["GET", () => http.get(api(`/spaces/${spaceB}`))],
      ["GET", () => http.get(api(`/spaces/${spaceB}/pages`))],
      ["GET", () => http.get(api(`/pages/${pageB}`))],
      ["GET", () => http.get(api(`/pages/${pageB}/versions`))],
      ["GET", () => http.get(api(`/pages/${pageB}/versions/${versionB}`))],
      ["PATCH", () => http.patch(api(`/spaces/${spaceB}`)).send({ name: "x" })],
      ["PATCH", () => http.patch(api(`/pages/${pageB}`)).send({ iconType: "LUCIDE" })],
      ["PATCH", () => http.patch(api(`/pages/${pageB}/status`)).send({ status: "DRAFT" })],
      ["PATCH", () => http.patch(api(`/pages/${pageB}/move`)).send({ parentId: null, index: 0 })],
      ["POST", () => http.post(api(`/spaces/${spaceB}/pages`)).send({ title: "x" })],
      ["POST", () => http.post(api(`/pages/${pageB}/versions`)).send({})],
      ["GET", () => http.get(api(`/pages/${pageB}/documents`))],
      ["DELETE", () => http.delete(api(`/pages/${pageB}`))],
      ["DELETE", () => http.delete(api(`/spaces/${spaceB}`))],
    ])("%s is 404 for org A", async (_m, call) => {
      const res = await call().set(managerA.auth)
      expect(res.status).toBe(404)
    })
  })

  it("sends no notifications when spaces, pages or documents are created", async () => {
    const space = await mkSpace(managerA, "Quiet space")
    const page = await mkPage(managerA, space, { title: "Quiet page", status: "PUBLISHED" })
    await http.patch(api(`/pages/${page.id}/status`)).set(managerA.auth).send({ status: "DRAFT" })
    await http.patch(api(`/pages/${page.id}/status`)).set(managerA.auth).send({ status: "PUBLISHED" })
    await http
      .post(api(`/pages/${page.id}/documents`))
      .set(managerA.auth)
      .attach("file", Buffer.from("%PDF-1.4\n"), { filename: "a.pdf", contentType: "application/pdf" })
      .expect(201)
    const n = await app.get(SystemPrismaService).notification.count({
      where: { userId: collabA.id, type: { startsWith: "know:" } },
    })
    expect(n).toBe(0)
  })

  it("accepts simultaneous pages and spaces with the same title", async () => {
    const space = await mkSpace(managerA, "Twin")
    const pages = await Promise.all(
      [1, 2, 3].map(() => http.post(api(`/spaces/${space}/pages`)).set(managerA.auth).send({ title: "Race" })),
    )
    expect(pages.map((r) => r.status)).toEqual([201, 201, 201])
    const spaces = await Promise.all(
      [1, 2].map(() => http.post(api("/spaces")).set(managerA.auth).send({ name: "Twin", icon: "book-open" })),
    )
    expect(spaces.map((r) => r.status)).toEqual([201, 201])
  })

  describe("search", () => {
    const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })
    let spaceId: string
    beforeAll(async () => {
      spaceId = await mkSpace(managerA, "Search space")
      await mkPage(managerA, spaceId, { title: "Handbook", content: doc("zebra crossing rules") })
      await mkPage(managerA, spaceId, { title: "Draft zebra", status: "DRAFT", content: doc("secret") })
    })
    const titles = (res: request.Response) => res.body.data.map((p: { title: string }) => p.title)

    it("finds pages by title and by body text", async () => {
      const body = await http.get(api("/search?q=zebra")).set(managerA.auth).expect(200)
      expect(titles(body)).toEqual(expect.arrayContaining(["Handbook", "Draft zebra"]))
      const title = await http.get(api("/search?q=handbook")).set(managerA.auth).expect(200)
      expect(titles(title)).toEqual(["Handbook"])
    })

    it("hides drafts from collaborators", async () => {
      const res = await http.get(api("/search?q=zebra")).set(collabA.auth).expect(200)
      expect(titles(res)).toEqual(["Handbook"])
    })

    it("never returns pages of another organization", async () => {
      const res = await http.get(api("/search?q=hello")).set(managerA.auth).expect(200)
      expect(JSON.stringify(res.body)).not.toContain(pageB)
      const mine = await http.get(api("/search?q=hello")).set(managerB.auth).expect(200)
      expect(titles(mine)).toEqual(["Secret hello B"])
    })

    it("mention search is scoped to the organization too", async () => {
      const mine = await http.get(api("/pages/search?q=hello")).set(managerB.auth).expect(200)
      expect(mine.body.data.map((p: { id: string }) => p.id)).toEqual([pageB])
      const other = await http.get(api("/pages/search?q=hello")).set(managerA.auth).expect(200)
      expect(other.body.data).toEqual([])
    })
  })

  describe("page versions", () => {
    it("lists versions without their bodies and returns one with its content", async () => {
      const space = await mkSpace(managerA, "Versions")
      const page = await mkPage(managerA, space, { title: "history" })
      const saved = await http.post(api(`/pages/${page.id}/versions`)).set(managerA.auth).expect(201)

      const list = await http.get(api(`/pages/${page.id}/versions`)).set(managerA.auth).expect(200)
      expect(list.body.data).toHaveLength(2)
      expect(list.body.data[0]).not.toHaveProperty("content")

      const one = await http.get(api(`/pages/${page.id}/versions/${saved.body.data.id}`)).set(managerA.auth).expect(200)
      expect(one.body.data).toMatchObject({ id: saved.body.data.id, version: 2 })
      expect(one.body.data.content).toMatchObject({ type: "doc" })
    })

    it("does not serve a version through another page, and the other organization's answers 404", async () => {
      const space = await mkSpace(managerA, "Versions mismatch")
      const page = await mkPage(managerA, space, { title: "mine" })
      await http.get(api(`/pages/${page.id}/versions/${versionB}`)).set(managerA.auth).expect(404)
      await http.get(api(`/pages/${pageB}/versions/${versionB}`)).set(managerA.auth).expect(404)
    })
  })

  describe("page hierarchy", () => {
    it("accepts a parent from the same space and rejects any other", async () => {
      const space = await mkSpace(managerA, "Tree")
      const otherSpace = await mkSpace(managerA, "Other tree")
      const root = await mkPage(managerA, space, { title: "root" })
      const child = await mkPage(managerA, space, { title: "child" })
      const foreign = await mkPage(managerA, otherSpace, { title: "foreign" })
      const move = (id: string, parentId: string | null, index = 0) =>
        http.patch(api(`/pages/${id}/move`)).set(managerA.auth).send({ parentId, index })

      expect((await move(child.id, root.id)).status).toBe(200)
      expect((await move(child.id, foreign.id)).status).toBe(400)
      expect((await move(child.id, pageB)).status).toBe(400)
      expect((await move(child.id, child.id)).status).toBe(400)
      expect((await move(root.id, child.id)).status).toBe(400) // would make a cycle
      expect((await move(child.id, null)).status).toBe(200)
    })

    it("orders siblings by the requested position and renumbers them", async () => {
      const space = await mkSpace(managerA, "Order")
      const a = await mkPage(managerA, space, { title: "a" })
      const b = await mkPage(managerA, space, { title: "b" })
      const c = await mkPage(managerA, space, { title: "c" })
      const move = (id: string, parentId: string | null | undefined, index: number) =>
        http.patch(api(`/pages/${id}/move`)).set(managerA.auth).send({ parentId, index })
      const order = async () =>
        (await http.get(api(`/spaces/${space}/pages`)).set(managerA.auth)).body.data
          .filter((p: { parentId: string | null }) => p.parentId === null)
          .map((p: { id: string }) => p.id)

      await move(a.id, null, 0).expect(200)
      await move(b.id, null, 1).expect(200)
      await move(c.id, null, 2).expect(200)
      expect(await order()).toEqual([a.id, b.id, c.id])
      await move(c.id, undefined, 0).expect(200) // no parentId: reorder only
      expect(await order()).toEqual([c.id, a.id, b.id])
      await move(a.id, c.id, 5).expect(200) // index past the end is last
      expect(await order()).toEqual([c.id, b.id])
      await move(b.id, null, -1).expect(400)
    })

    it("moving pages is not an edit: no page's updatedAt changes", async () => {
      const space = await mkSpace(managerA, "Move is not an edit")
      const a = await mkPage(managerA, space, { title: "a" })
      const b = await mkPage(managerA, space, { title: "b" })
      const c = await mkPage(managerA, space, { title: "c" })
      const stamps = async () =>
        (await app.get(SystemPrismaService).page.findMany({ where: { spaceId: space }, select: { id: true, updatedAt: true } }))
          .sort((x, y) => x.id.localeCompare(y.id))
      const before = await stamps()
      await new Promise((r) => setTimeout(r, 20))
      await http.patch(api(`/pages/${c.id}/move`)).set(managerA.auth).send({ parentId: null, index: 0 }).expect(200)
      await http.patch(api(`/pages/${a.id}/move`)).set(managerA.auth).send({ parentId: b.id, index: 0 }).expect(200)
      expect(await stamps()).toEqual(before)
    })

    it("does not let another organization's page block deletion", async () => {
      const space = await mkSpace(managerA, "Block")
      const page = await mkPage(managerA, space, { title: "mine" })
      await http.patch(api(`/pages/${page.id}/move`)).set(managerA.auth).send({ parentId: pageB, index: 0 }).expect(400)
      await http.delete(api(`/pages/${pageB}`)).set(managerB.auth).expect(200)
    })
  })

  describe("unpublished pages are hidden from collaborators", () => {
    let spaceId: string
    let draft: string
    let archived: string
    let docId: string
    let docVersionId: string
    const pdf = Buffer.from("%PDF-1.4\nsecret\n")

    beforeAll(async () => {
      spaceId = await mkSpace(managerA, "Hidden")
      draft = (await mkPage(managerA, spaceId, { title: "Draft secret", status: "DRAFT" })).id
      archived = (await mkPage(managerA, spaceId, { title: "Old", status: "ARCHIVED" })).id
      await http.post(api(`/pages/${draft}/versions`)).set(managerA.auth).send({}).expect(201)
      const doc = await http
        .post(api(`/pages/${draft}/documents`))
        .set(managerA.auth)
        .attach("file", pdf, { filename: "payroll.pdf", contentType: "application/pdf" })
        .expect(201)
      docId = doc.body.data.id
      docVersionId = doc.body.data.currentVersion.id
    })

    const asCollab = (path: string) => http.get(api(path)).set(collabA.auth)

    it.each([
      ["page", () => `/pages/${draft}`],
      ["archived page", () => `/pages/${archived}`],
      ["page versions", () => `/pages/${draft}/versions`],
      ["page documents", () => `/pages/${draft}/documents`],
      ["document versions", () => `/documents/${docId}/versions`],
      ["document download", () => `/documents/${docId}/versions/${docVersionId}/download`],
    ])("%s answers 404", async (_name, path) => {
      expect((await asCollab(path())).status).toBe(404)
    })

    it("page tree and mention search leave them out", async () => {
      const tree = await asCollab(`/spaces/${spaceId}/pages`).expect(200)
      expect(tree.body.data).toEqual([])
      const mentions = await asCollab(`/pages/search?q=Draft&spaceId=${spaceId}`).expect(200)
      expect(mentions.body.data).toEqual([])
    })

    it("editors still see everything", async () => {
      await http.get(api(`/pages/${draft}`)).set(managerA.auth).expect(200)
      await http.get(api(`/documents/${docId}/versions`)).set(managerA.auth).expect(200)
    })

    it("a collaborator sees the page once it is published", async () => {
      await http.patch(api(`/pages/${draft}/status`)).set(managerA.auth).send({ status: "PUBLISHED" }).expect(200)
      await asCollab(`/pages/${draft}`).expect(200)
      await asCollab(`/pages/${draft}/documents`).expect(200)
    })
  })

  describe("deleting content removes its files", () => {
    const PDF = Buffer.from("%PDF-1.4\nfile\n")
    const fileStatus = async (key: string) => (await http.get(`/api/v1/files/${key}`).set(managerA.auth)).status
    const addDocument = async (pageId: string) => {
      const res = await http
        .post(api(`/pages/${pageId}/documents`))
        .set(managerA.auth)
        .attach("file", PDF, { filename: "a.pdf", contentType: "application/pdf" })
        .expect(201)
      const v = await http.get(api(`/documents/${res.body.data.id}/versions`)).set(managerA.auth)
      return (await app.get(SystemPrismaService).documentVersion.findUniqueOrThrow({ where: { id: v.body.data[0].id } })).key
    }

    it("a deleted page takes its images and documents with it", async () => {
      const space = await mkSpace(managerA, "Cleanup page")
      const page = await mkPage(managerA, space, { title: "gone" })
      const keys = [await addImage(page.id), await addDocument(page.id)]
      for (const k of keys) expect(await fileStatus(k)).toBe(200)
      await http.delete(api(`/pages/${page.id}`)).set(managerA.auth).expect(200)
      for (const k of keys) expect(await fileStatus(k)).toBe(404)
    })

    describe("an image removed from a page body", () => {
      const store = (pageId: string, content: object) =>
        http
          .put(`/api/v1/internal/collab/documents/know.page/${pageId}`)
          .set({ "X-Collab-Secret": process.env.COLLAB_INTERNAL_SECRET ?? "" })
          .send({ ydoc: Buffer.from([1]).toString("base64"), fields: { body: content, title: "t" }, editors: [] })
          .expect(204)
      const withImage = (key: string) => ({ type: "doc", content: [{ type: "image", attrs: { src: key } }, { type: "paragraph" }] })
      const empty = { type: "doc", content: [{ type: "paragraph" }] }
      const setup = async (name: string) => {
        const space = await mkSpace(managerA, name)
        const page = await mkPage(managerA, space, { title: "p" })
        const key = await addImage(page.id)
        await store(page.id, withImage(key))
        return { space, page, key }
      }

      it("is deleted from storage", async () => {
        const { page, key } = await setup("Image gc")
        expect(await fileStatus(key)).toBe(200)
        await store(page.id, empty)
        expect(await fileStatus(key)).toBe(404)
      })

      it("stays while it is still in the body", async () => {
        const { page, key } = await setup("Image gc still used")
        await store(page.id, { type: "doc", content: [{ type: "paragraph" }, withImage(key).content[0]] })
        expect(await fileStatus(key)).toBe(200)
      })

      it("stays while a saved version uses it", async () => {
        const { page, key } = await setup("Image gc version")
        await app.get(SystemPrismaService).pageVersion.create({
          data: { pageId: page.id, version: 99, title: "v", content: withImage(key), authorId: managerA.id },
        })
        await store(page.id, empty)
        expect(await fileStatus(key)).toBe(200)
      })

      it("stays while another page uses it", async () => {
        const { space, page, key } = await setup("Image gc shared")
        const other = await mkPage(managerA, space, { title: "other" })
        await store(other.id, withImage(key))
        await store(page.id, empty)
        expect(await fileStatus(key)).toBe(200)
      })
    })

    describe("sweeping orphan images", () => {
      const sweep = (apply: boolean, graceMs?: number) =>
        sweepOrphanImages(app.get(SystemPrismaService), app.get(StorageService), {
          apply,
          graceMs,
          prefix: `organizations/${managerA.orgId}/`,
        })

      it("finds and deletes only images nothing references", async () => {
        const space = await mkSpace(managerA, "Sweep")
        const page = await mkPage(managerA, space, { title: "p" })
        const orphan = await addImage(page.id)
        const used = await addImage(page.id)
        await http
          .put(`/api/v1/internal/collab/documents/know.page/${page.id}`)
          .set({ "X-Collab-Secret": process.env.COLLAB_INTERNAL_SECRET ?? "" })
          .send({
            ydoc: Buffer.from([1]).toString("base64"),
            fields: { body: { type: "doc", content: [{ type: "image", attrs: { src: used } }, { type: "paragraph" }] }, title: "t" },
            editors: [],
          })
          .expect(204)

        expect(await sweep(false)).not.toContain(orphan) // too recent: an upload may not be saved yet
        const found = await sweep(false, 0)
        expect(found).toContain(orphan)
        expect(found).not.toContain(used)
        expect(await fileStatus(orphan)).toBe(200) // a dry run deletes nothing

        await sweep(true, 0)
        expect(await fileStatus(orphan)).toBe(404)
        expect(await fileStatus(used)).toBe(200)
      })
    })

    it("a deleted space takes the files of all its pages with it, and only those", async () => {
      const space = await mkSpace(managerA, "Cleanup space")
      const keep = await mkSpace(managerA, "Keep space")
      const keptImage = await addImage((await mkPage(managerA, keep, { title: "kept" })).id)
      const p1 = await mkPage(managerA, space, { title: "p1" })
      const p2 = await mkPage(managerA, space, { title: "p2", parentId: p1.id })
      const keys = [await addImage(p1.id), await addDocument(p2.id)]
      await http.delete(api(`/spaces/${space}`)).set(managerA.auth).expect(200)
      for (const k of keys) expect(await fileStatus(k)).toBe(404)
      expect(await fileStatus(keptImage)).toBe(200)
    })
  })

  describe("defaults and numbering", () => {
    it("creates a space from just a name", async () => {
      const res = await http.post(api("/spaces")).set(managerA.auth).send({ name: "Only a name" })
      expect(res.status).toBe(201)
      expect(res.body.data.icon).toBe("book-open")
    })

    it("stamps publishedAt on pages published by default, and only on those", async () => {
      const space = await mkSpace(managerA, "Dates")
      const published = await mkPage(managerA, space, { title: "default status" })
      const draft = await mkPage(managerA, space, { title: "draft", status: "DRAFT" })
      expect(published.publishedAt).not.toBeNull()
      expect(draft.publishedAt).toBeNull()
    })

    it("numbers simultaneous snapshots without repeating a version", async () => {
      const space = await mkSpace(managerA, "Versions")
      const page = await mkPage(managerA, space, { title: "versions" })
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => http.post(api(`/pages/${page.id}/versions`)).set(managerA.auth).send({})),
      )
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201])
      const list = await http.get(api(`/pages/${page.id}/versions`)).set(managerA.auth).expect(200)
      const numbers = list.body.data.map((v: { version: number }) => v.version).sort((a: number, b: number) => a - b)
      expect(numbers).toEqual([1, 2, 3, 4, 5])
    })
  })

  describe("space and page fields", () => {
    const createSpace = (body: object) => http.post(api("/spaces")).set(managerA.auth).send(body)
    const patchSpace = (id: string, body: object) => http.patch(api(`/spaces/${id}`)).set(managerA.auth).send(body)
    const patchPage = (id: string, body: object) => http.patch(api(`/pages/${id}`)).set(managerA.auth).send(body)

    it("creates a space with an emoji icon, and rejects an emoji icon without the emoji", async () => {
      const ok = await createSpace({ name: "Rocket", iconType: "EMOJI", emoji: "🚀" }).expect(201)
      expect(ok.body.data).toMatchObject({ iconType: "EMOJI", emoji: "🚀" })
      await createSpace({ name: "Bad", iconType: "EMOJI" }).expect(400)
    })

    it("validates icon changes against what the space already has", async () => {
      const space = await mkSpace(managerA, "Icons")
      await patchSpace(space, { iconType: "EMOJI" }).expect(400) // no emoji yet
      await patchSpace(space, { iconType: "EMOJI", emoji: "📚" }).expect(200)
      await patchSpace(space, { iconType: "LUCIDE" }).expect(200) // keeps the stored lucide icon
      await patchSpace(space, { iconType: "LUCIDE", icon: null }).expect(400)
    })

    it("validates page icons against what the page already has", async () => {
      const space = await mkSpace(managerA, "Page fields")
      const page = await mkPage(managerA, space, { title: "fields" })
      await patchPage(page.id, { iconType: "EMOJI" }).expect(400)
      const withEmoji = await patchPage(page.id, { iconType: "EMOJI", emoji: "📘" }).expect(200)
      expect(withEmoji.body.data).toMatchObject({ iconType: "EMOJI", emoji: "📘" })
    })

    it("pages and spaces carry no cover or background fields", async () => {
      const space = await mkSpace(managerA, "No covers")
      const page = await mkPage(managerA, space, { title: "plain" })
      const got = await http.get(api(`/pages/${page.id}`)).set(managerA.auth).expect(200)
      expect(got.body.data).not.toHaveProperty("coverType")
      const sp = await http.get(api(`/spaces/${space}`)).set(managerA.auth).expect(200)
      expect(sp.body.data).not.toHaveProperty("heroBackgroundType")
    })

    it("saving page fields does not create a version; only the explicit snapshot does", async () => {
      const space = await mkSpace(managerA, "Autosave")
      const page = await mkPage(managerA, space, { title: "autosave" })
      await patchPage(page.id, { iconType: "LUCIDE" }).expect(200)
      await patchPage(page.id, { status: "DRAFT" }).expect(200)
      const versions = async () => (await http.get(api(`/pages/${page.id}/versions`)).set(managerA.auth)).body.data.length
      expect(await versions()).toBe(1) // only the one made on creation
      await http.post(api(`/pages/${page.id}/versions`)).set(managerA.auth).send({}).expect(201)
      expect(await versions()).toBe(2)
    })
  })

  describe("content is checked by the shared editor schema", () => {
    const paragraph = (...content: object[]) => ({ type: "paragraph", content })
    const text = (value: string, marks?: object[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) })
    const doc = (...content: object[]) => ({ type: "doc", content })
    const unknownNode = doc({ type: "evil" })
    const javascriptLink = doc(paragraph(text("click", [{ type: "link", attrs: { href: "javascript:alert(1)" } }])))
    const foreignImage = doc({ type: "image", attrs: { src: "http://evil.example/x.png" } })
    const imageDoc = (key: string) => doc({ type: "image", attrs: { src: key } })
    const good = doc(paragraph(text("kept words")))

    it.each([
      ["an unknown node", unknownNode],
      ["a javascript: link", javascriptLink],
      ["a foreign image", foreignImage],
      ["an image key of another organization", imageDoc("organizations/00000000-0000-4000-8000-000000000000/uploads/a.png")],
    ])("creating a page with %s answers 400", async (_name, content) => {
      const space = await mkSpace(managerA, "Content create")
      await http.post(api(`/spaces/${space}/pages`)).set(managerA.auth).send({ title: "bad", content }).expect(400)
    })

    it("accepts an image key of the user's own organization", async () => {
      const space = await mkSpace(managerA, "Own image")
      const key = await addImage((await mkPage(managerA, space, { title: "source" })).id)
      await mkPage(managerA, space, { title: "with image", content: imageDoc(key) })
    })

    it.each([
      ["title", { title: "renamed" }],
      ["content", { content: good }],
      ["a valid field together with content", { iconType: "LUCIDE", content: good }],
    ])("PATCH with %s answers 400: title and body are written through the live document", async (_name, body) => {
      const space = await mkSpace(managerA, "Content update")
      const page = await mkPage(managerA, space, { title: "upd", content: good })
      await http.patch(api(`/pages/${page.id}`)).set(managerA.auth).send(body).expect(400)
      const after = await http.get(api(`/pages/${page.id}`)).set(managerA.auth).expect(200)
      expect(after.body.data).toMatchObject({ title: "upd", content: good })
    })

    it("restoring a stored version whose content is no longer valid answers 400", async () => {
      const space = await mkSpace(managerA, "Content restore")
      const page = await mkPage(managerA, space, { title: "restore me", content: good })
      const broken = await app.get(SystemPrismaService).pageVersion.create({
        data: { pageId: page.id, title: "old", content: unknownNode, authorId: managerA.id, version: 40 },
      })
      await http.post(api(`/pages/${page.id}/restore/${broken.id}`)).set(managerA.auth).expect(400)
      const after = await http.get(api(`/pages/${page.id}`)).set(managerA.auth).expect(200)
      expect(after.body.data).toMatchObject({ title: "restore me", content: good })
    })

    it("stores a valid body and indexes its text and mention labels", async () => {
      const space = await mkSpace(managerA, "Valid content")
      const target = await mkPage(managerA, space, { title: "Target" })
      const content = doc(
        paragraph(
          text("Read the "),
          text("lemur guide", [{ type: "link", attrs: { href: "https://example.com/guide" } }]),
          text(" then "),
          {
            type: "pageMention",
            attrs: { id: target.id, label: "Okapi policy", spaceId: space, spaceName: "Valid content", archived: false, mentionSuggestionChar: "@" },
          },
        ),
      )
      const page = await mkPage(managerA, space, { title: "Valid body", content })
      const stored = await http.get(api(`/pages/${page.id}`)).set(managerA.auth).expect(200)
      expect(stored.body.data.content).toEqual(content)
      const byText = await http.get(api("/search?q=lemur")).set(managerA.auth).expect(200)
      expect(byText.body.data.map((p: { id: string }) => p.id)).toContain(page.id)
      const byMention = await http.get(api("/search?q=Okapi")).set(managerA.auth).expect(200)
      expect(byMention.body.data.map((p: { id: string }) => p.id)).toContain(page.id)
    })
  })
})
