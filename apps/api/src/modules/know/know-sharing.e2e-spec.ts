import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

describe("KNOW sharing e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>

  let admin: TestActor
  let manager: TestActor // MANAGER entry on the space
  let editor: TestActor // EDITOR entry
  let viewer: TestActor // VIEWER entry
  let guest: TestActor // no entry
  let otherOrgAdmin: TestActor
  let space: string
  let otherSpace: string
  let area: string
  let position: string

  const api = (p: string) => `/api/v1/know${p}`
  const send = (method: "get" | "post" | "patch" | "delete", who: TestActor, path: string, body?: object) => {
    const r = http[method](api(path)).set(who.auth)
    return body ? r.send(body) : r
  }
  const entries = async (who: TestActor = manager, id = space) =>
    (await send("get", who, `/spaces/${id}/access`).expect(200)).body.entries as {
      id: string
      role: string
      principal: { type: string; id: string; name: string }
    }[]
  const add = (who: TestActor, body: object, id = space) => send("post", who, `/spaces/${id}/access`, body)

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    admin = await createActor(app, "sh-admin", "ADMIN")
    const org = admin.orgId
    manager = await createActor(app, "sh-manager", "COLLABORATOR", org)
    editor = await createActor(app, "sh-editor", "COLLABORATOR", org)
    viewer = await createActor(app, "sh-viewer", "COLLABORATOR", org)
    guest = await createActor(app, "sh-guest", "COLLABORATOR", org)
    otherOrgAdmin = await createActor(app, "sh-other", "ADMIN")

    const mk = (name: string) =>
      prisma.space.create({ data: { name, restricted: true, organizationId: org, createdBy: admin.id } }).then((s) => s.id)
    space = await mk("Shared")
    otherSpace = await mk("Not shared")
    for (const [who, role] of [[manager, "MANAGER"], [editor, "EDITOR"], [viewer, "VIEWER"]] as const) {
      await prisma.spaceAccess.create({ data: { spaceId: space, userId: who.id, role, createdById: admin.id } })
    }
    area = (await prisma.orgNode.create({ data: { name: "Quality", organizationId: org } })).id
    position = (await prisma.position.create({ data: { name: "Auditor", organizationId: org, createdById: admin.id } })).id
  })

  afterAll(async () => app?.close())

  describe("who may manage the list", () => {
    it("managers and ADMIN can; editors, viewers and people without access cannot", async () => {
      await send("get", admin, `/spaces/${space}/access`).expect(200)
      await send("get", manager, `/spaces/${space}/access`).expect(200)
      for (const who of [editor, viewer]) {
        await send("get", who, `/spaces/${space}/access`).expect(403)
        await add(who, { principalType: "USER", principalId: guest.id, role: "VIEWER" }).expect(403)
      }
      await send("get", guest, `/spaces/${space}/access`).expect(404)
      await add(guest, { principalType: "USER", principalId: guest.id, role: "MANAGER" }).expect(404)
    })

    it("a manager of one space has no say over another", async () => {
      await send("get", manager, `/spaces/${otherSpace}/access`).expect(404)
      await add(manager, { principalType: "USER", principalId: guest.id, role: "VIEWER" }, otherSpace).expect(404)
    })

    it("another organization reaches nothing", async () => {
      await send("get", otherOrgAdmin, `/spaces/${space}/access`).expect(404)
      await add(otherOrgAdmin, { principalType: "USER", principalId: guest.id, role: "VIEWER" }).expect(404)
    })
  })

  describe("listing", () => {
    it("shows each entry with the name of its principal", async () => {
      const list = await entries()
      expect(list).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: "MANAGER", principal: expect.objectContaining({ type: "USER", id: manager.id, name: "sh-manager Test" }) }),
          expect.objectContaining({ role: "EDITOR", principal: expect.objectContaining({ id: editor.id }) }),
        ]),
      )
      const body = (await send("get", manager, `/spaces/${space}/access`).expect(200)).body
      expect(body.restricted).toBe(true)
    })
  })

  describe("changing access", () => {
    it("takes effect on the next request: add, raise, lower and remove", async () => {
      await send("get", guest, `/spaces/${space}`).expect(404)

      const created = await add(manager, { principalType: "USER", principalId: guest.id, role: "VIEWER" }).expect(201)
      const entryId = created.body.id as string
      await send("get", guest, `/spaces/${space}`).expect(200)
      await send("post", guest, `/spaces/${space}/pages`, { title: "x" }).expect(403)

      await send("patch", manager, `/spaces/${space}/access/${entryId}`, { role: "EDITOR" }).expect(200)
      await send("post", guest, `/spaces/${space}/pages`, { title: "now allowed" }).expect(201)

      await send("patch", manager, `/spaces/${space}/access/${entryId}`, { role: "VIEWER" }).expect(200)
      await send("post", guest, `/spaces/${space}/pages`, { title: "again no" }).expect(403)

      await send("delete", manager, `/spaces/${space}/access/${entryId}`).expect(204)
      await send("get", guest, `/spaces/${space}`).expect(404)
    })

    it("adding the same principal twice updates its role instead of duplicating it", async () => {
      await add(manager, { principalType: "POSITION", principalId: position, role: "VIEWER" }).expect(201)
      await add(manager, { principalType: "POSITION", principalId: position, role: "EDITOR" }).expect(201)
      const mine = (await entries()).filter((e) => e.principal.id === position)
      expect(mine).toHaveLength(1)
      expect(mine[0].role).toBe("EDITOR")
    })

    it("reaches people through an area or a position", async () => {
      const member = await createActor(app, "sh-member", "COLLABORATOR", admin.orgId)
      await prisma.userProfile.create({ data: { userId: member.id, orgNodeId: area } })
      await send("get", member, `/spaces/${space}`).expect(404)
      await add(manager, { principalType: "ORG_NODE", principalId: area, role: "VIEWER" }).expect(201)
      await send("get", member, `/spaces/${space}`).expect(200)
    })

    it("a space can be opened to the whole organization without losing its entries", async () => {
      const count = (await entries()).length
      await send("patch", manager, `/spaces/${space}`, { restricted: false }).expect(200)
      await send("get", guest, `/spaces/${space}`).expect(200)
      expect(await entries()).toHaveLength(count)
      await send("patch", manager, `/spaces/${space}`, { restricted: true }).expect(200)
    })

    it("audits every change", async () => {
      const rows = await prisma.auditLog.findMany({ where: { organizationId: admin.orgId, entityType: "SpaceAccess" } })
      const actions = new Set(rows.map((r) => r.action))
      expect(actions).toEqual(new Set(["SpaceAccess.SET", "SpaceAccess.REMOVE"]))
    })
  })

  describe("validation", () => {
    it("rejects principals from another organization, inactive ones and malformed input", async () => {
      const foreignUser = await createActor(app, "sh-foreign", "COLLABORATOR")
      const foreignNode = await prisma.orgNode.create({ data: { name: "Foreign", organizationId: foreignUser.orgId } })
      const foreignPosition = await prisma.position.create({
        data: { name: "Foreign", organizationId: foreignUser.orgId, createdById: foreignUser.id },
      })
      const gone = await createActor(app, "sh-gone", "COLLABORATOR", admin.orgId)
      await prisma.user.update({ where: { id: gone.id }, data: { isActive: false } })
      const archived = await prisma.orgNode.create({
        data: { name: "Old", organizationId: admin.orgId, isActive: false, archivedAt: new Date() },
      })

      for (const body of [
        { principalType: "USER", principalId: foreignUser.id, role: "VIEWER" },
        { principalType: "ORG_NODE", principalId: foreignNode.id, role: "VIEWER" },
        { principalType: "POSITION", principalId: foreignPosition.id, role: "VIEWER" },
        { principalType: "USER", principalId: gone.id, role: "VIEWER" },
        { principalType: "ORG_NODE", principalId: archived.id, role: "VIEWER" },
      ]) {
        const res = await add(manager, body)
        expect([400, 404]).toContain(res.status)
      }
      await add(manager, { principalType: "GROUP", principalId: guest.id, role: "VIEWER" }).expect(400)
      await add(manager, { principalType: "USER", principalId: "not-a-uuid", role: "VIEWER" }).expect(400)
      await add(manager, { principalType: "USER", principalId: guest.id, role: "OWNER" }).expect(400)
      expect(await prisma.spaceAccess.count({ where: { spaceId: space, userId: { in: [foreignUser.id, gone.id] } } })).toBe(0)
    })

    it("entries are looked up inside the space and organization named in the URL", async () => {
      const elsewhere = await prisma.spaceAccess.create({
        data: { spaceId: otherSpace, userId: guest.id, role: "VIEWER", createdById: admin.id },
      })
      await send("patch", manager, `/spaces/${space}/access/${elsewhere.id}`, { role: "MANAGER" }).expect(404)
      await send("delete", manager, `/spaces/${space}/access/${elsewhere.id}`).expect(404)
      await send("patch", otherOrgAdmin, `/spaces/${space}/access/${elsewhere.id}`, { role: "MANAGER" }).expect(404)
      expect((await prisma.spaceAccess.findUniqueOrThrow({ where: { id: elsewhere.id } })).role).toBe("VIEWER")
    })
  })

  describe("when the principal goes away", () => {
    it("deleting an area or a position removes its entries", async () => {
      const node = await prisma.orgNode.create({ data: { name: "Temp area", organizationId: admin.orgId } })
      const pos = await prisma.position.create({ data: { name: "Temp position", organizationId: admin.orgId, createdById: admin.id } })
      await add(manager, { principalType: "ORG_NODE", principalId: node.id, role: "VIEWER" }).expect(201)
      await add(manager, { principalType: "POSITION", principalId: pos.id, role: "VIEWER" }).expect(201)
      await prisma.orgNode.delete({ where: { id: node.id } })
      await prisma.position.delete({ where: { id: pos.id } })
      const left = (await entries()).map((e) => e.principal.id)
      expect(left).not.toContain(node.id)
      expect(left).not.toContain(pos.id)
    })
  })
})
