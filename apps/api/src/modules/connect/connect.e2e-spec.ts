import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { config } from "dotenv"
import { resolve } from "path"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, type TestActor } from "../../test-helpers"

config({ path: resolve(__dirname, "../../../../../.env") })

/** A post body as the composer sends it: a serialized TipTap document. */
const doc = (...paragraphs: string[]) =>
  JSON.stringify({
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  })

describe("CONNECT e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  // Organization A
  let author: TestActor
  let colleague: TestActor
  let manager: TestActor
  // Organization B
  let outsider: TestActor

  const createPost = (actor: TestActor, body: Record<string, unknown> = {}) =>
    http
      .post("/api/v1/connect/posts")
      .set(actor.auth)
      .send({ body: doc("hello"), ...body })

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    author = await createActor(app, "author")
    colleague = await createActor(app, "colleague", "COLLABORATOR", author.orgId)
    manager = await createActor(app, "manager", "MANAGER", author.orgId)
    outsider = await createActor(app, "outsider", "ADMIN")
  })

  afterAll(async () => {
    await app.close()
  })

  describe("organization isolation", () => {
    let postId: string
    let commentId: string

    beforeAll(async () => {
      postId = (await createPost(author).expect(201)).body.data.id
      commentId = (
        await http
          .post(`/api/v1/connect/posts/${postId}/comments`)
          .set(colleague.auth)
          .send({ body: "nice" })
          .expect(201)
      ).body.data.id
    })

    it("another organization cannot like a post", async () => {
      await http.post(`/api/v1/connect/posts/${postId}/like`).set(outsider.auth).expect(404)
      expect(await prisma.postLike.count({ where: { postId } })).toBe(0)
    })

    it("another organization cannot comment on a post", async () => {
      await http
        .post(`/api/v1/connect/posts/${postId}/comments`)
        .set(outsider.auth)
        .send({ body: "leak" })
        .expect(404)
      expect(await prisma.postComment.count({ where: { postId, authorId: outsider.id } })).toBe(0)
    })

    it("another organization's admin cannot delete a comment", async () => {
      await http.delete(`/api/v1/connect/comments/${commentId}`).set(outsider.auth).expect(404)
      expect(await prisma.postComment.count({ where: { id: commentId } })).toBe(1)
    })

    it("another organization cannot read who liked a post", async () => {
      await http.post(`/api/v1/connect/posts/${postId}/like`).set(colleague.auth).expect(200)
      await http.get(`/api/v1/connect/posts/${postId}/likes`).set(outsider.auth).expect(404)
      await http.get(`/api/v1/connect/posts/${postId}/likes`).set(colleague.auth).expect(200)
    })

    it("another organization cannot read comments, the feed or the directory of this one", async () => {
      await http.get(`/api/v1/connect/posts/${postId}/comments`).set(outsider.auth).expect(404)
      const feed = await http.get("/api/v1/connect/feed").set(outsider.auth).expect(200)
      expect(feed.body.data).toEqual([])
      await http.get(`/api/v1/connect/directory/${author.id}`).set(outsider.auth).expect(404)
      const directory = await http.get("/api/v1/connect/directory").set(outsider.auth).expect(200)
      expect(directory.body.data.map((u: { id: string }) => u.id)).toEqual([outsider.id])
    })

    it("another organization cannot react to this organization's celebrations", async () => {
      await http
        .post("/api/v1/connect/celebrations/reactions")
        .set(outsider.auth)
        .send({ targetUserId: author.id, type: "BIRTHDAY", emoji: "🎉" })
        .expect(404)
      expect(await prisma.celebrationReaction.count({ where: { targetUserId: author.id } })).toBe(0)
    })
  })

  describe("post images", () => {
    const key = (orgId: string) => `organizations/${orgId}/uploads/a.png`

    it("accepts keys uploaded by the own organization", async () => {
      await createPost(author, { images: [key(author.orgId)] }).expect(201)
    })

    it.each([
      ["another organization's key", () => key("00000000-0000-0000-0000-000000000000")],
      ["an arbitrary external URL", () => "https://evil.example/x.png"],
      ["a path outside uploads/", () => `organizations/${author.orgId}/know/covers/a.png`],
      ["a traversal attempt", () => `organizations/${author.orgId}/uploads/../../other/a.png`],
    ])("rejects %s on create and update", async (_label, image) => {
      await createPost(author, { images: [image()] }).expect(400)
      const own = (await createPost(author).expect(201)).body.data.id
      await http
        .patch(`/api/v1/connect/posts/${own}`)
        .set(author.auth)
        .send({ images: [image()] })
        .expect(400)
    })
  })

  describe("posting privileges", () => {
    it("collaborators cannot publish announcements or pin posts", async () => {
      await createPost(colleague, { type: "ANNOUNCEMENT" }).expect(403)
      await createPost(colleague, { isPinned: true }).expect(403)
    })

    it("collaborators cannot turn their own post into a pinned announcement", async () => {
      const id = (await createPost(colleague).expect(201)).body.data.id
      await http.patch(`/api/v1/connect/posts/${id}`).set(colleague.auth).send({ type: "ANNOUNCEMENT" }).expect(403)
      await http.patch(`/api/v1/connect/posts/${id}`).set(colleague.auth).send({ isPinned: true }).expect(403)
      expect((await prisma.post.findUniqueOrThrow({ where: { id } })).type).toBe("POST")
    })

    it("moderators (tenant role MANAGER) can publish announcements", async () => {
      await createPost(manager, { type: "ANNOUNCEMENT", title: "Hi" }).expect(201)
    })

    it("only the author or an admin can edit or delete a post", async () => {
      const id = (await createPost(author).expect(201)).body.data.id
      await http.patch(`/api/v1/connect/posts/${id}`).set(colleague.auth).send({ body: "x" }).expect(403)
      await http.delete(`/api/v1/connect/posts/${id}`).set(colleague.auth).expect(403)
      await http.delete(`/api/v1/connect/posts/${id}`).set(author.auth).expect(200)
    })
  })

  describe("post body validation", () => {
    const docWith = (node: object) => JSON.stringify({ type: "doc", content: [node] })
    const link = (href: string) =>
      docWith({
        type: "paragraph",
        content: [{ type: "text", text: "link", marks: [{ type: "link", attrs: { href } }] }],
      })

    it("rejects raw HTML: bodies are documents, never markup", async () => {
      await createPost(author, { body: `<img src=x onerror="alert(1)">` }).expect(400)
      await createPost(author, { body: `<p>hi</p>` }).expect(400)
    })

    it("rejects nodes and links the editor schema does not allow", async () => {
      await createPost(author, { body: docWith({ type: "script", content: [] }) }).expect(400)
      await createPost(author, { body: link("javascript:alert(1)") }).expect(400)
      await createPost(author, {
        body: docWith({ type: "image", attrs: { src: "https://evil.example/x.png" } }),
      }).expect(400)
    })

    it("rejects an empty document", async () => {
      await createPost(author, {
        body: JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] }),
      }).expect(400)
    })

    it("validates on edit too and never stores the rejected body", async () => {
      const id = (await createPost(author).expect(201)).body.data.id
      const patch = (body: string) =>
        http.patch(`/api/v1/connect/posts/${id}`).set(author.auth).send({ body })
      await patch(`<script>alert(1)</script>`).expect(400)
      await patch(link("javascript:alert(1)")).expect(400)
      expect((await prisma.post.findUniqueOrThrow({ where: { id } })).body).toBe(doc("hello"))
    })

    it("stores a valid document and derives a plain-text excerpt", async () => {
      const body = link("https://example.com")
      const id = (await createPost(author, { body }).expect(201)).body.data.id
      const post = await prisma.post.findUniqueOrThrow({ where: { id } })
      expect(JSON.parse(post.body)).toEqual(JSON.parse(body))
      expect(post.excerpt).toBe("link")
    })
  })

  describe("feed", () => {
    let org: { admin: TestActor; a: TestActor; b: TestActor; boss: TestActor }
    const feed = (actor: TestActor, query = "") =>
      http.get(`/api/v1/connect/feed${query}`).set(actor.auth).expect(200)
    const ids = (res: request.Response) => res.body.data.map((p: { id: string }) => p.id)

    beforeAll(async () => {
      const admin = await createActor(app, "feedadmin", "ADMIN")
      org = {
        admin,
        a: await createActor(app, "feeda", "COLLABORATOR", admin.orgId),
        b: await createActor(app, "feedb", "COLLABORATOR", admin.orgId),
        boss: await createActor(app, "feedboss", "MANAGER", admin.orgId),
      }
    })

    it("lists posts newest first with the caller's like state and counts", async () => {
      const first = (await createPost(org.a, { body: doc("one") }).expect(201)).body.data.id
      const second = (await createPost(org.a, { body: doc("two") }).expect(201)).body.data.id
      await http.post(`/api/v1/connect/posts/${second}/like`).set(org.b.auth).expect(200)
      await http.post(`/api/v1/connect/posts/${second}/comments`).set(org.b.auth).send({ body: "hi" }).expect(201)

      const res = await feed(org.b, "?sort=recent")
      expect(ids(res).slice(0, 2)).toEqual([second, first])
      const [top] = res.body.data
      expect(top).toMatchObject({ likedByMe: true, _count: { likes: 1, comments: 1 } })
      expect(top.recentLikers.map((u: { id: string }) => u.id)).toEqual([org.b.id])
      expect((await feed(org.a, "?sort=recent")).body.data[0].likedByMe).toBe(false)
    })

    it("shows pinned announcements first, once, without repeating them on later pages", async () => {
      const pinned = (await createPost(org.boss, { type: "ANNOUNCEMENT", title: "Pinned" }).expect(201)).body.data.id
      for (let i = 0; i < 3; i++) await createPost(org.a, { body: doc(`page ${i}`) }).expect(201)

      const page1 = await feed(org.a, "?limit=2")
      expect(ids(page1)[0]).toBe(pinned)
      const page2 = await feed(org.a, `?limit=2&cursor=${encodeURIComponent(page1.body.meta.cursor)}`)
      expect(ids(page2)).not.toContain(pinned)
      expect(new Set([...ids(page1), ...ids(page2)]).size).toBe(ids(page1).length + ids(page2).length)
    })

    it("liking twice toggles and never errors under concurrent taps", async () => {
      const id = (await createPost(org.a).expect(201)).body.data.id
      const like = () => http.post(`/api/v1/connect/posts/${id}/like`).set(org.b.auth)
      const liked = (await like().expect(200)).body.data
      expect(liked).toMatchObject({ liked: true, likesCount: 1 })
      expect(liked.recentLikers.map((u: { id: string }) => u.id)).toEqual([org.b.id])
      expect((await like().expect(200)).body.data).toEqual({ liked: false, likesCount: 0, recentLikers: [] })
      const statuses = (await Promise.all([like(), like()])).map((r) => r.status)
      expect(statuses.every((s) => s === 200)).toBe(true)
    })

    it("answers with the three newest likers so the card never shows a count it cannot name", async () => {
      const id = (await createPost(org.a).expect(201)).body.data.id
      const like = (actor: TestActor) => http.post(`/api/v1/connect/posts/${id}/like`).set(actor.auth).expect(200)
      await like(org.a)
      await like(org.b)
      await like(org.boss)
      const last = (await like(org.admin)).body.data
      expect(last.likesCount).toBe(4)
      expect(last.recentLikers.map((u: { id: string }) => u.id)).toEqual([org.admin.id, org.boss.id, org.b.id])
      expect(last.recentLikers[0]).toEqual({
        id: org.admin.id,
        firstName: expect.any(String),
        lastName: expect.any(String),
        avatarUrl: null,
      })
    })

    it("lists everyone who liked a post, newest first, in pages", async () => {
      const id = (await createPost(org.a).expect(201)).body.data.id
      for (const actor of [org.a, org.b, org.boss]) {
        await http.post(`/api/v1/connect/posts/${id}/like`).set(actor.auth).expect(200)
      }
      const list = (query: string) => http.get(`/api/v1/connect/posts/${id}/likes${query}`).set(org.admin.auth).expect(200)

      const first = await list("?limit=2")
      expect(first.body.data.map((u: { id: string }) => u.id)).toEqual([org.boss.id, org.b.id])
      expect(first.body.data[0]).toEqual({
        id: org.boss.id,
        firstName: expect.any(String),
        lastName: expect.any(String),
        avatarUrl: null,
      })
      const second = await list(`?limit=2&cursor=${encodeURIComponent(first.body.meta.cursor)}`)
      expect(second.body.data.map((u: { id: string }) => u.id)).toEqual([org.a.id])
      expect(second.body.meta.cursor).toBeUndefined()
    })

    it("answers 404 for the likes of a post that does not exist", async () => {
      await http.get("/api/v1/connect/posts/00000000-0000-0000-0000-000000000000/likes").set(org.a.auth).expect(404)
    })

    it("has no feed suggestions endpoint anymore", async () => {
      await http.get("/api/v1/connect/feed/suggestions").set(org.a.auth).expect(404)
    })
  })

  describe("comments", () => {
    it("lists comments oldest first; only the author or an admin can delete one", async () => {
      const postId = (await createPost(author).expect(201)).body.data.id
      const comment = async (actor: TestActor, body: string) =>
        (await http.post(`/api/v1/connect/posts/${postId}/comments`).set(actor.auth).send({ body }).expect(201)).body.data.id
      const first = await comment(colleague, "first")
      await comment(author, "second")

      const list = await http.get(`/api/v1/connect/posts/${postId}/comments`).set(author.auth).expect(200)
      expect(list.body.data.map((c: { body: string }) => c.body)).toEqual(["first", "second"])

      await http.delete(`/api/v1/connect/comments/${first}`).set(manager.auth).expect(403)
      await http.delete(`/api/v1/connect/comments/${first}`).set(colleague.auth).expect(200)
    })
  })

  describe("directory", () => {
    it("filters by role using the real role names", async () => {
      const res = await http.get("/api/v1/connect/directory?roles=COLLABORATOR").set(author.auth).expect(200)
      const roles = new Set(res.body.data.map((u: { role: string }) => u.role))
      expect(roles).toEqual(new Set(["COLLABORATOR"]))
    })

    it("searches by name and returns the member's area breadcrumb", async () => {
      const area = await prisma.orgNode.create({ data: { name: "Dir parent", organizationId: author.orgId } })
      const child = await prisma.orgNode.create({
        data: { name: "Dir child", organizationId: author.orgId, parentId: area.id },
      })
      await prisma.userProfile.create({ data: { userId: colleague.id, orgNodeId: child.id } })

      const found = await http.get("/api/v1/connect/directory?search=colleague").set(author.auth).expect(200)
      expect(found.body.data.map((u: { id: string }) => u.id)).toEqual([colleague.id])
      const none = await http.get("/api/v1/connect/directory?search=zzzz-nobody").set(author.auth).expect(200)
      expect(none.body.data).toEqual([])

      const byArea = await http.get(`/api/v1/connect/directory?orgNodeIds=${child.id}`).set(author.auth).expect(200)
      expect(byArea.body.data.map((u: { id: string }) => u.id)).toEqual([colleague.id])
      const detail = await http.get(`/api/v1/connect/directory/${colleague.id}`).set(author.auth).expect(200)
      expect(detail.body.data.profile.orgNode.path).toEqual(["Dir parent", "Dir child"])
    })
  })

  describe("celebrations", () => {
    let admin: TestActor
    let member: TestActor
    let newcomer: TestActor
    const sameDay = (yearsAgo: number) => {
      const now = new Date()
      return new Date(Date.UTC(now.getUTCFullYear() - yearsAgo, now.getUTCMonth(), now.getUTCDate(), 12))
    }
    const today = async () =>
      (await http.get("/api/v1/connect/celebrations/today").set(member.auth).expect(200)).body.data
    const settings = (body: object) =>
      http.patch("/api/v1/connect/celebrations/settings").set(admin.auth).send(body).expect(200)

    beforeAll(async () => {
      admin = await createActor(app, "celadmin", "ADMIN")
      member = await createActor(app, "celmember", "COLLABORATOR", admin.orgId)
      newcomer = await createActor(app, "celnew", "COLLABORATOR", admin.orgId)
      await prisma.userProfile.create({
        data: { userId: member.id, birthDate: sameDay(30), joinedAt: sameDay(3), showBirthday: true },
      })
      await prisma.userProfile.create({ data: { userId: newcomer.id } }) // joined today
    })

    it("lists today's birthdays and anniversaries, but not an account created today", async () => {
      const data = await today()
      expect(data.birthdays.map((b: { id: string }) => b.id)).toEqual([member.id])
      expect(data.anniversaries.map((a: { id: string }) => a.id)).toEqual([member.id])
      expect(data.anniversaries[0].years).toBe(3)
    })

    it("hides a birthday the person chose not to share", async () => {
      await prisma.userProfile.update({ where: { userId: member.id }, data: { showBirthday: false } })
      expect((await today()).birthdays).toEqual([])
      await prisma.userProfile.update({ where: { userId: member.id }, data: { showBirthday: true } })
    })

    it("obeys the organization's celebration settings; only admins change them", async () => {
      await http.patch("/api/v1/connect/celebrations/settings").set(member.auth).send({ showBirthdays: false }).expect(403)

      await settings({ showBirthdays: false })
      let data = await today()
      expect(data.birthdays).toEqual([])
      expect(data.anniversaries).toHaveLength(1)

      await settings({ showBirthdays: true, showAnniversaries: false })
      data = await today()
      expect(data.birthdays).toHaveLength(1)
      expect(data.anniversaries).toEqual([])

      await settings({ celebrationsEnabled: false, showAnniversaries: true })
      expect(await today()).toEqual({ birthdays: [], anniversaries: [] })
      await settings({ celebrationsEnabled: true })
    })

    it("reacts once per celebration (toggle) and notifies the person", async () => {
      const react = () =>
        http
          .post("/api/v1/connect/celebrations/reactions")
          .set(admin.auth)
          .send({ targetUserId: member.id, type: "BIRTHDAY", emoji: "🎉" })
          .expect(200)
      expect((await react()).body.data).toEqual({ reacted: true, emoji: "🎉" })
      expect(await prisma.notification.count({ where: { userId: member.id, type: "connect:celebration:reaction" } })).toBe(1)
      expect((await react()).body.data).toEqual({ reacted: false, emoji: null })
    })

    it("shows years in the organization on the profile, only while anniversaries are shown", async () => {
      await settings({ celebrationsEnabled: true, showAnniversaries: true })
      const profileOf = async (id: string) =>
        (await http.get(`/api/v1/connect/directory/${id}`).set(admin.auth).expect(200)).body.data.profile
      expect((await profileOf(member.id)).yearsInOrganization).toBe(3)
      expect((await profileOf(newcomer.id)).yearsInOrganization).toBeNull()

      await settings({ showAnniversaries: false })
      expect((await profileOf(member.id)).yearsInOrganization).toBeNull()
      await settings({ showAnniversaries: true })
    })
  })
})
