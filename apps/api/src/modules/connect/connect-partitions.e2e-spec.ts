import { INestApplication } from "@nestjs/common"
import { ModuleKey } from "@prisma/client"
import request from "supertest"
import { withOrg } from "../../common/request-context"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, type TestActor } from "../../test-helpers"
import { isolatedOrg, type IsolatedOrg } from "../org/node-partitions.helpers"
import { PrincipalType } from "../org/principal"
import { PostAccessService } from "./post-access.service"

const doc = (text: string) =>
  JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] })

describe("CONNECT under node partitions e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let postAccess: PostAccessService
  let http: ReturnType<typeof request>
  let iso: IsolatedOrg
  let aSub: TestActor
  let bSub: TestActor
  let posGlobal: string
  let posA: string
  let posB: string

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    postAccess = app.get(PostAccessService)
    http = request(app.getHttpServer())
    iso = await isolatedOrg(app, [ModuleKey.KNOW, ModuleKey.GROW, ModuleKey.CONNECT])

    posGlobal = (
      await prisma.position.create({
        data: { name: "Global Analyst", organizationId: iso.orgId, createdById: iso.admin.id },
      })
    ).id
    posA = (
      await prisma.position.create({
        data: { name: "Lead A", organizationId: iso.orgId, orgNodeId: iso.nodes.a, createdById: iso.admin.id },
      })
    ).id
    posB = (
      await prisma.position.create({
        data: { name: "Lead B", organizationId: iso.orgId, orgNodeId: iso.nodes.b, createdById: iso.admin.id },
      })
    ).id

    aSub = await createActor(app, "cp-asub", "COLLABORATOR", iso.orgId)
    await prisma.userProfile.create({
      data: { userId: aSub.id, organizationId: iso.orgId, orgNodeId: iso.nodes.areaA, positionId: posA },
    })
    bSub = await createActor(app, "cp-bsub", "COLLABORATOR", iso.orgId)
    await prisma.userProfile.create({
      data: { userId: bSub.id, organizationId: iso.orgId, orgNodeId: iso.nodes.areaB, positionId: posB },
    })
  })

  afterAll(async () => {
    await prisma.organization.update({ where: { id: iso.orgId }, data: { isolateRootNodes: false } })
    await prisma.instanceSettings.upsert({
      where: { id: 1 },
      create: { nodeIsolationAllowed: false },
      update: { nodeIsolationAllowed: false },
    })
    await app.close()
  })

  describe("Feed & post audience", () => {
    it("non-crosser posts default to own main node, reject opening to all (403) and reject other partitions / global positions (404)", async () => {
      // Default post by `a` is restricted to root A.
      const resA = await http
        .post("/api/v1/connect/posts")
        .set(iso.a.auth)
        .send({ body: doc("Hello A") })
        .expect(201)
      const postA = resA.body.data
      expect(postA.restricted).toBe(true)
      expect(postA.audience).toEqual([
        expect.objectContaining({ type: PrincipalType.ORG_NODE, id: iso.nodes.a }),
      ])

      // `aSub` (under areaA) sees it; `b` and `nobody` do not; moderators see everything.
      const feedA = await http.get("/api/v1/connect/feed").set(aSub.auth).expect(200)
      expect(feedA.body.data.map((p: { id: string }) => p.id)).toContain(postA.id)
      const feedB = await http.get("/api/v1/connect/feed").set(iso.b.auth).expect(200)
      expect(feedB.body.data.map((p: { id: string }) => p.id)).not.toContain(postA.id)
      const feedNobody = await http.get("/api/v1/connect/feed").set(iso.nobody.auth).expect(200)
      expect(feedNobody.body.data.map((p: { id: string }) => p.id)).not.toContain(postA.id)
      const feedMod = await http.get("/api/v1/connect/feed").set(iso.moderator.auth).expect(200)
      expect(feedMod.body.data.map((p: { id: string }) => p.id)).toContain(postA.id)

      // Non-crosser cannot open a post to everyone (403 ISOLATION_OPEN_POST).
      const openTry = await http
        .post("/api/v1/connect/posts")
        .set(iso.a.auth)
        .send({ body: doc("Nope"), restricted: false })
        .expect(403)
      expect(openTry.body.code).toBe("ISOLATION_OPEN_POST")

      // Non-crosser cannot target B's node, B's user, B's position, or a global position (404).
      for (const target of [
        { type: PrincipalType.ORG_NODE, id: iso.nodes.b },
        { type: PrincipalType.USER, id: iso.b.id },
        { type: PrincipalType.POSITION, id: posB },
        { type: PrincipalType.POSITION, id: posGlobal },
      ]) {
        await http
          .post("/api/v1/connect/posts")
          .set(iso.a.auth)
          .send({ body: doc("Nope"), restricted: true, audience: [target] })
          .expect(404)
      }

      // Person with no node cannot post with default audience (400 NODE_REQUIRED).
      const noNodePost = await http
        .post("/api/v1/connect/posts")
        .set(iso.nobody.auth)
        .send({ body: doc("No node") })
        .expect(400)
      expect(noNodePost.body.code).toBe("NODE_REQUIRED")

      // Empty restricted audience is refused (400 POST_AUDIENCE_REQUIRED).
      const emptyAudience = await http
        .post("/api/v1/connect/posts")
        .set(iso.a.auth)
        .send({ body: doc("Empty"), restricted: true, audience: [] })
        .expect(400)
      expect(emptyAudience.body.code).toBe("POST_AUDIENCE_REQUIRED")
    })

    it("gates likes, comments, notifications, hiddenAudienceCount and recipientUserIds by post audience", async () => {
      // Crosser creates a post targeted to both A and B + a global position.
      const mixed = (
        await http
          .post("/api/v1/connect/posts")
          .set(iso.admin.auth)
          .send({
            title: "Mixed",
            body: doc("Cross-partition"),
            type: "ANNOUNCEMENT",
            isPinned: true,
            pinnedExpiresAt: "2099-01-01T00:00:00.000Z",
            restricted: true,
            audience: [
              { type: PrincipalType.ORG_NODE, id: iso.nodes.a },
              { type: PrincipalType.ORG_NODE, id: iso.nodes.b },
              { type: PrincipalType.POSITION, id: posGlobal },
            ],
          })
          .expect(201)
      ).body.data

      // Admin sees all 3 entries; `a` sees only A plus hiddenAudienceCount: 2.
      expect(mixed.audience).toHaveLength(3)
      expect(mixed.hiddenAudienceCount).toBe(0)
      const feedA = await http.get("/api/v1/connect/feed").set(iso.a.auth).expect(200)
      const seenByA = feedA.body.data.find((p: { id: string }) => p.id === mixed.id)
      expect(seenByA.audience).toEqual([
        expect.objectContaining({ type: PrincipalType.ORG_NODE, id: iso.nodes.a }),
      ])
      expect(seenByA.hiddenAudienceCount).toBe(2)

      // Post restricted only to A: B cannot like, list likes, comment, or read comments (all 404).
      const onlyA = (
        await http
          .post("/api/v1/connect/posts")
          .set(iso.courseManager.auth)
          .send({
            title: "Only A announcement",
            body: doc("Secret A"),
            restricted: true,
            audience: [{ type: PrincipalType.ORG_NODE, id: iso.nodes.a }],
          })
          .expect(201)
      ).body.data

      await http.post(`/api/v1/connect/posts/${onlyA.id}/like`).set(iso.b.auth).expect(404)
      await http.get(`/api/v1/connect/posts/${onlyA.id}/likes`).set(iso.b.auth).expect(404)
      await http
        .post(`/api/v1/connect/posts/${onlyA.id}/comments`)
        .set(iso.b.auth)
        .send({ body: "peek" })
        .expect(404)
      await http.get(`/api/v1/connect/posts/${onlyA.id}/comments`).set(iso.b.auth).expect(404)

      // `aSub` CAN like and comment; B still cannot delete A's comment.
      await http.post(`/api/v1/connect/posts/${onlyA.id}/like`).set(aSub.auth).expect(200)
      const comment = (
        await http
          .post(`/api/v1/connect/posts/${onlyA.id}/comments`)
          .set(aSub.auth)
          .send({ body: "Nice!" })
          .expect(201)
      ).body.data
      await http.delete(`/api/v1/connect/comments/${comment.id}`).set(iso.b.auth).expect(404)

      // WebSocket recipientUserIds includes A's subtree, author & moderators, and excludes B & nobody.
      const recipients = await withOrg(iso.orgId, () => postAccess.recipientUserIds(onlyA.id, iso.orgId))
      expect(recipients).toEqual(expect.arrayContaining([iso.a.id, aSub.id, iso.courseManager.id, iso.admin.id, iso.moderator.id]))
      expect(recipients).not.toContain(iso.b.id)
      expect(recipients).not.toContain(bSub.id)
      expect(recipients).not.toContain(iso.nobody.id)

      // Crosser announcement targeted to A notifies A (and moderators/author), never B.
      await http
        .post("/api/v1/connect/posts")
        .set(iso.admin.auth)
        .send({
          title: "Announce A",
          body: doc("For A"),
          type: "ANNOUNCEMENT",
          isPinned: true,
          pinnedExpiresAt: "2099-01-01T00:00:00.000Z",
          restricted: true,
          audience: [{ type: PrincipalType.ORG_NODE, id: iso.nodes.a }],
        })
        .expect(201)
      const notifsA = await prisma.notification.findMany({ where: { userId: iso.a.id, title: { contains: "Announce A" } } })
      const notifsB = await prisma.notification.findMany({ where: { userId: iso.b.id, title: { contains: "Announce A" } } })
      expect(notifsA).toHaveLength(1)
      expect(notifsB).toHaveLength(0)

      // Crosser can publish an open post (`restricted: false`), visible to everyone including `b` and `nobody`.
      const openPost = (
        await http
          .post("/api/v1/connect/posts")
          .set(iso.courseManager.auth)
          .send({ body: doc("All clients"), restricted: false })
          .expect(201)
      ).body.data
      expect(openPost.restricted).toBe(false)
      const feedNobody = await http.get("/api/v1/connect/feed").set(iso.nobody.auth).expect(200)
      expect(feedNobody.body.data.map((p: { id: string }) => p.id)).toContain(openPost.id)
    })
  })

  describe("Directory under isolation", () => {
    it("confines non-crossers to their own partition even under negated filters, and hides cross-partition profiles", async () => {
      const dirA = await http.get("/api/v1/connect/directory").set(iso.a.auth).expect(200)
      const idsA = dirA.body.data.map((u: { id: string }) => u.id)
      expect(idsA).toEqual(expect.arrayContaining([iso.a.id, aSub.id]))
      expect(idsA).not.toContain(iso.b.id)
      expect(idsA).not.toContain(bSub.id)
      expect(idsA).not.toContain(iso.nobody.id)
      expect(idsA).not.toContain(iso.admin.id)

      // Negated filter cannot escape the partition.
      const negated = await http
        .get(`/api/v1/connect/directory?orgNodeIds=${iso.nodes.a}&orgNodeIdsOp=not_in`)
        .set(iso.a.auth)
        .expect(200)
      const negIds = negated.body.data.map((u: { id: string }) => u.id)
      expect(negIds).not.toContain(iso.b.id)
      expect(negIds).not.toContain(bSub.id)

      // Person with no node sees nobody.
      const dirNobody = await http.get("/api/v1/connect/directory").set(iso.nobody.auth).expect(200)
      expect(dirNobody.body.data).toEqual([])

      // Crosser sees everyone.
      const dirAdmin = await http.get("/api/v1/connect/directory?limit=50").set(iso.admin.auth).expect(200)
      const idsAdmin = dirAdmin.body.data.map((u: { id: string }) => u.id)
      expect(idsAdmin).toEqual(expect.arrayContaining([iso.a.id, iso.b.id, aSub.id, bSub.id]))

      // Profile reads: own partition OK, other partition 404, own profile OK even for nobody.
      await http.get(`/api/v1/connect/directory/${aSub.id}`).set(iso.a.auth).expect(200)
      await http.get(`/api/v1/connect/directory/${iso.b.id}`).set(iso.a.auth).expect(404)
      await http.get(`/api/v1/connect/directory/${iso.nobody.id}`).set(iso.nobody.auth).expect(200)
    })
  })

  describe("Celebrations under isolation", () => {
    it("shows only celebrations in the viewer's partition and rejects cross-partition reactions (404)", async () => {
      const today = new Date()
      const bday = new Date(Date.UTC(1995, today.getUTCMonth(), today.getUTCDate()))
      await prisma.userProfile.update({
        where: { userId: aSub.id },
        data: { birthDate: bday, showBirthday: true },
      })
      await prisma.userProfile.update({
        where: { userId: bSub.id },
        data: { birthDate: bday, showBirthday: true },
      })

      const celA = await http.get("/api/v1/connect/celebrations/today").set(iso.a.auth).expect(200)
      const bdayIdsA = celA.body.data.birthdays.map((p: { id: string }) => p.id)
      expect(bdayIdsA).toContain(aSub.id)
      expect(bdayIdsA).not.toContain(bSub.id)

      const celNobody = await http.get("/api/v1/connect/celebrations/today").set(iso.nobody.auth).expect(200)
      expect(celNobody.body.data.birthdays).toEqual([])

      const celAdmin = await http.get("/api/v1/connect/celebrations/today").set(iso.admin.auth).expect(200)
      expect(celAdmin.body.data.birthdays.map((p: { id: string }) => p.id)).toEqual(
        expect.arrayContaining([aSub.id, bSub.id]),
      )

      // Reaction within partition succeeds; cross-partition returns 404.
      await http
        .post("/api/v1/connect/celebrations/reactions")
        .set(iso.a.auth)
        .send({ targetUserId: aSub.id, type: "BIRTHDAY", emoji: "🎉" })
        .expect(200)
      await http
        .post("/api/v1/connect/celebrations/reactions")
        .set(iso.a.auth)
        .send({ targetUserId: bSub.id, type: "BIRTHDAY", emoji: "🎉" })
        .expect(404)
    })
  })
})
