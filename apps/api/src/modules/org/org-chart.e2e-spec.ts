import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { config } from "dotenv"
import { resolve } from "path"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, type TestActor } from "../../test-helpers"

config({ path: resolve(__dirname, "../../../../../.env") })

const AREAS = "/api/v1/org/areas"
const POSITIONS = "/api/v1/org/positions"
const assignment = (userId: string) => `/api/v1/org/members/${userId}/assignment`

describe("Org chart & positions e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  let admin: TestActor
  let member: TestActor
  let outsiderAdmin: TestActor

  const createArea = (actor: TestActor, body: Record<string, unknown>) =>
    http.post(AREAS).set(actor.auth).send(body)
  const areaId = async (actor: TestActor, name: string, parentId?: string) =>
    (await createArea(actor, { name, parentId }).expect(201)).body.data.id as string
  const createPosition = (actor: TestActor, body: Record<string, unknown>) =>
    http.post(POSITIONS).set(actor.auth).send(body)

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    admin = await createActor(app, "admin", "ADMIN")
    member = await createActor(app, "member", "COLLABORATOR", admin.orgId)
    outsiderAdmin = await createActor(app, "outsider", "ADMIN")
  })

  afterAll(async () => {
    await app.close()
  })

  describe("organization isolation", () => {
    let area: string
    let position: string

    beforeAll(async () => {
      area = await areaId(admin, "Isolated area")
      position = (await createPosition(admin, { name: "Isolated position" }).expect(201)).body.data.id
    })

    it("does not list another organization's areas or positions", async () => {
      const areas = await http.get(AREAS).set(outsiderAdmin.auth).expect(200)
      expect(areas.body.data).toEqual([])
      const positions = await http.get(POSITIONS).set(outsiderAdmin.auth).expect(200)
      expect(positions.body.data).toEqual([])
    })

    it("another organization's admin cannot read or change an area", async () => {
      const as = outsiderAdmin.auth
      await http.patch(`${AREAS}/${area}`).set(as).send({ name: "Hacked" }).expect(404)
      await http.patch(`${AREAS}/${area}/move`).set(as).send({ newParentId: null }).expect(404)
      const own = await areaId(outsiderAdmin, "Own")
      await http.delete(`${AREAS}/${area}?reassignTo=${own}`).set(as).expect(404)
      await http.delete(`${AREAS}/${own}?reassignTo=${area}`).set(as).expect(404)
      await createArea(outsiderAdmin, { name: "Child", parentId: area }).expect(404)
      expect((await prisma.orgNode.findUniqueOrThrow({ where: { id: area } })).name).toBe("Isolated area")
    })

    it("another organization's admin cannot change a position", async () => {
      const as = outsiderAdmin.auth
      await http.patch(`${POSITIONS}/${position}`).set(as).send({ name: "Hacked" }).expect(404)
      await http.post(`${POSITIONS}/${position}/archive`).set(as).expect(404)
      await http.delete(`${POSITIONS}/${position}`).set(as).expect(404)
      await createPosition(outsiderAdmin, { name: "Scoped", orgNodeId: area }).expect(400)
    })

    it("another organization's admin cannot assign people, areas or positions across organizations", async () => {
      const as = outsiderAdmin.auth
      await http.patch(assignment(member.id)).set(as).send({ orgNodeId: null }).expect(404)
      const own = await createActor(app, "own", "COLLABORATOR", outsiderAdmin.orgId)
      const assign = (body: object) =>
        http.patch(assignment(own.id)).set(as).send(body)
      await assign({ orgNodeId: area }).expect(400)
      await assign({ positionId: position }).expect(404)
    })
  })

  describe("independence from CONNECT", () => {
    it("is administered normally while the CONNECT module is off", async () => {
      const kt = await createActor(app, "knowonly", "ADMIN")
      await prisma.organization.update({
        where: { id: kt.orgId },
        data: { enabledModules: ["KNOW", "GROW"] },
      })

      await http.get("/api/v1/connect/feed").set(kt.auth).expect(403)

      const area = await areaId(kt, "Without connect")
      const position = (await createPosition(kt, { name: "Without connect" }).expect(201)).body.data.id
      const person = await createActor(app, "plain", "COLLABORATOR", kt.orgId)
      await http.patch(assignment(person.id)).set(kt.auth).send({ orgNodeId: area, positionId: position }).expect(200)
      await http.get(AREAS).set(person.auth).expect(200)
    })
  })

  describe("permissions", () => {
    it("members can read the structure but not change it", async () => {
      await http.get(AREAS).set(member.auth).expect(200)
      await http.get(POSITIONS).set(member.auth).expect(200)
      await createArea(member, { name: "Nope" }).expect(403)
      await createPosition(member, { name: "Nope" }).expect(403)
      await http.get(`${AREAS}/full`).set(member.auth).expect(403)
      await http.patch(assignment(member.id)).set(member.auth).send({ orgNodeId: null }).expect(403)
    })
  })

  describe("integrity", () => {
    it("rejects duplicate area names under the same parent, including at the root", async () => {
      await createArea(admin, { name: "Root dup" }).expect(201)
      await createArea(admin, { name: "Root dup" }).expect(409)
      const parent = await areaId(admin, "Dup parent")
      await areaId(admin, "Same", parent)
      await createArea(admin, { name: "Same", parentId: parent }).expect(409)
      await createArea(admin, { name: "Same" }).expect(201) // other parent: allowed
    })

    it("rejects duplicate global positions but allows the same name in different areas", async () => {
      await createPosition(admin, { name: "Global dup" }).expect(201)
      await createPosition(admin, { name: "Global dup" }).expect(409)
      const a = await areaId(admin, "Pos area A")
      const b = await areaId(admin, "Pos area B")
      await createPosition(admin, { name: "Scoped dup", orgNodeId: a }).expect(201)
      await createPosition(admin, { name: "Scoped dup", orgNodeId: a }).expect(409)
      await createPosition(admin, { name: "Scoped dup", orgNodeId: b }).expect(201)
    })

    it("a person manages at most one area, even under concurrent requests", async () => {
      const manager = await createActor(app, "boss", "MANAGER", admin.orgId)
      const x = await areaId(admin, "Managed X")
      const y = await areaId(admin, "Managed Y")
      const set = (id: string) => http.patch(`${AREAS}/${id}`).set(admin.auth).send({ managerId: manager.id })
      const statuses = (await Promise.all([set(x), set(y)])).map((r) => r.status).sort()
      expect(statuses).toEqual([200, 409])
      expect(await prisma.orgNode.count({ where: { managerId: manager.id } })).toBe(1)
    })

    it("rejects moves that create cycles or exceed the maximum depth", async () => {
      const root = await areaId(admin, "Cycle root")
      const child = await areaId(admin, "Cycle child", root)
      await http.patch(`${AREAS}/${root}/move`).set(admin.auth).send({ newParentId: child }).expect(400)
      let parent = root
      for (let depth = 2; depth <= 6; depth++) parent = await areaId(admin, `Depth ${depth}`, parent)
      await createArea(admin, { name: "Too deep", parentId: parent }).expect(400)
    })

    it("archiving needs a reassignTo target and moves the members there", async () => {
      const from = await areaId(admin, "Archive from")
      const to = await areaId(admin, "Archive to")
      const person = await createActor(app, "moved", "COLLABORATOR", admin.orgId)
      await http.patch(assignment(person.id)).set(admin.auth).send({ orgNodeId: from }).expect(200)

      await http.delete(`${AREAS}/${from}`).set(admin.auth).expect(400)
      await http.delete(`${AREAS}/${from}?reassignTo=${to}`).set(admin.auth).expect(200)

      const moved = await prisma.userProfile.findUniqueOrThrow({ where: { userId: person.id } })
      expect(moved.orgNodeId).toBe(to)
      expect(moved.assignmentChangedAt).not.toBeNull()
      const tree = await http.get(AREAS).set(admin.auth).expect(200)
      expect(tree.body.data.map((n: { id: string }) => n.id)).not.toContain(from)
    })
  })

  describe("moving areas", () => {
    // Created straight in the database: the create route is throttled per person and this block makes many.
    let seeded = 0
    const seed = async (actor: TestActor, name: string, parentId?: string) =>
      (
        await prisma.orgNode.create({
          data: { name, parentId: parentId ?? null, organizationId: actor.orgId, sortOrder: (seeded += 10) },
        })
      ).id
    const move = (actor: TestActor, id: string, body: Record<string, unknown>) =>
      http.patch(`${AREAS}/${id}/move`).set(actor.auth).send(body)
    /** Names of the active children of `parentId` in display order. */
    const order = async (parentId: string | null) =>
      (
        await prisma.orgNode.findMany({
          where: { organizationId: admin.orgId, parentId, isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        })
      ).map((n) => n.name)

    it("reorders siblings before a given sibling and renumbers them", async () => {
      const root = await seed(admin, "Order root")
      await seed(admin, "Order A", root)
      await seed(admin, "Order B", root)
      const c = await seed(admin, "Order C", root)
      const a = (await prisma.orgNode.findFirstOrThrow({ where: { name: "Order A", parentId: root } })).id
      // two siblings with the same sortOrder, as the old drag left them
      await prisma.orgNode.updateMany({ where: { parentId: root }, data: { sortOrder: 5 } })

      await move(admin, c, { beforeId: a }).expect(200)
      expect(await order(root)).toEqual(["Order C", "Order A", "Order B"])
      const orders = (await prisma.orgNode.findMany({ where: { parentId: root } })).map((n) => n.sortOrder)
      expect(new Set(orders).size).toBe(3)

      await move(admin, c, {}).expect(200) // no beforeId: last
      expect(await order(root)).toEqual(["Order A", "Order B", "Order C"])
    })

    it("moves an area under another one, or back to the top level, at the chosen place", async () => {
      const root = await seed(admin, "Reparent root")
      const target = await seed(admin, "Reparent target", root)
      const first = await seed(admin, "Reparent first", target)
      const mover = await seed(admin, "Reparent mover", root)

      await move(admin, mover, { newParentId: target, beforeId: first }).expect(200)
      expect(await order(target)).toEqual(["Reparent mover", "Reparent first"])
      expect(await order(root)).toEqual(["Reparent target"])

      await move(admin, mover, { newParentId: null }).expect(200)
      expect((await prisma.orgNode.findUniqueOrThrow({ where: { id: mover } })).parentId).toBeNull()
      expect(await order(target)).toEqual(["Reparent first"])
    })

    it("rejects a place that is not among the new siblings", async () => {
      const root = await seed(admin, "Place root")
      const elsewhere = await seed(admin, "Place elsewhere")
      const mover = await seed(admin, "Place mover", root)
      await move(admin, mover, { beforeId: elsewhere }).expect(404)
      await move(admin, mover, { beforeId: mover }).expect(404)
    })

    it("answers 409 when the new parent already has an area with that name", async () => {
      const left = await seed(admin, "Name left")
      const right = await seed(admin, "Name right")
      await seed(admin, "Twin", left)
      const twin = await seed(admin, "Twin", right)
      await move(admin, twin, { newParentId: left }).expect(409)
      expect((await prisma.orgNode.findUniqueOrThrow({ where: { id: twin } })).parentId).toBe(right)
    })

    it("counts the moved area's own subtree against the maximum depth", async () => {
      let parent = await seed(admin, "Height 1")
      const chain = [parent]
      for (let depth = 2; depth <= 5; depth++) {
        parent = await seed(admin, `Height ${depth}`, parent)
        chain.push(parent)
      }
      const subtree = await seed(admin, "Height subtree")
      await seed(admin, "Height leaf", subtree) // the subtree is two levels tall
      await move(admin, subtree, { newParentId: chain[4] }).expect(400) // level 5 + 2 > 6
      const refused = await move(admin, subtree, { newParentId: chain[4] })
      expect(refused.body.code).toBe("ORG_DEPTH_EXCEEDED")
      await move(admin, subtree, { newParentId: chain[3] }).expect(200) // level 4 + 2 = 6
    })

    it("only admins move areas, and never across organizations", async () => {
      const mine = await seed(admin, "Cross mine")
      const sibling = await seed(admin, "Cross sibling")
      const theirs = await seed(outsiderAdmin, "Cross theirs")
      await move(member, mine, { newParentId: null }).expect(403)
      await move(outsiderAdmin, theirs, { newParentId: mine }).expect(404)
      await move(outsiderAdmin, theirs, { beforeId: sibling }).expect(404)
      await move(admin, mine, { newParentId: theirs }).expect(404)
      await move(admin, mine, { beforeId: theirs }).expect(404)
      expect((await prisma.orgNode.findUniqueOrThrow({ where: { id: theirs } })).parentId).toBeNull()
    })
  })

  describe("assignments", () => {
    it("a scoped position needs the user to be in that area", async () => {
      const a = await areaId(admin, "Assign A")
      const b = await areaId(admin, "Assign B")
      const scoped = (await createPosition(admin, { name: "Assign scoped", orgNodeId: a }).expect(201)).body.data.id
      const person = await createActor(app, "assigned", "COLLABORATOR", admin.orgId)
      const assign = (body: object) =>
        http.patch(assignment(person.id)).set(admin.auth).send(body)

      await assign({ positionId: scoped }).expect(400) // no area yet
      await assign({ orgNodeId: b, positionId: scoped }).expect(400) // other area
      await assign({ orgNodeId: a, positionId: scoped }).expect(200)
      // moving the person away from the area must not leave a position scoped to the old one
      await assign({ orgNodeId: b }).expect(400)
      await assign({ orgNodeId: b, positionId: null }).expect(200)
    })

    it("stamps assignmentChangedAt when the area or position changes, not when the values stay", async () => {
      const area = await areaId(admin, "Stamp area")
      const position = (await createPosition(admin, { name: "Stamp position" }).expect(201)).body.data.id
      const person = await createActor(app, "stamped", "COLLABORATOR", admin.orgId)
      const assign = (body: object) => http.patch(assignment(person.id)).set(admin.auth).send(body).expect(200)
      const stamp = async () =>
        (await prisma.userProfile.findUniqueOrThrow({ where: { userId: person.id } })).assignmentChangedAt

      await assign({ orgNodeId: area })
      const first = await stamp()
      expect(first).not.toBeNull()

      await assign({ orgNodeId: area }) // same values
      expect(await stamp()).toEqual(first)

      await assign({ orgNodeId: area, positionId: position })
      const second = await stamp()
      expect(second!.getTime()).toBeGreaterThan(first!.getTime())

      await assign({ positionId: null })
      expect((await stamp())!.getTime()).toBeGreaterThan(second!.getTime())
    })
  })
})
