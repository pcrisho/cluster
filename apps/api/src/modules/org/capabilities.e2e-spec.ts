import { INestApplication } from "@nestjs/common"
import request from "supertest"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { createActor, createTestApp, TestActor } from "../../test-helpers"

describe("Capabilities e2e", () => {
  let app: INestApplication
  let prisma: SystemPrismaService
  let http: ReturnType<typeof request>
  let admin: TestActor
  let member: TestActor
  let outsiderAdmin: TestActor

  const url = (p: string) => `/api/v1/org${p}`

  beforeAll(async () => {
    app = await createTestApp()
    prisma = app.get(SystemPrismaService)
    http = request(app.getHttpServer())
    admin = await createActor(app, "cap-admin", "ADMIN")
    member = await createActor(app, "cap-member", "MANAGER", admin.orgId)
    outsiderAdmin = await createActor(app, "cap-out", "ADMIN")
  })

  afterAll(async () => app?.close())

  it("lists the catalog grouped by module, for administrators only", async () => {
    const res = await http.get(url("/capabilities")).set(admin.auth).expect(200)
    expect(res.body).toEqual(
      expect.arrayContaining([
        { capability: "KNOW_SPACE_CREATE", module: "KNOW" },
        { capability: "KNOW_SPACE_DELETE", module: "KNOW" },
        { capability: "GROW_COURSE_MANAGE", module: "GROW" },
      ]),
    )
    await http.get(url("/capabilities")).set(member.auth).expect(403)
  })

  it("only administrators read or change a member's capabilities", async () => {
    await http.get(url(`/members/${member.id}/capabilities`)).set(member.auth).expect(403)
    await http.put(url(`/members/${member.id}/capabilities`)).set(member.auth).send({ capabilities: [] }).expect(403)
  })

  it("replaces the member's set, shows it on /auth/me and audits the change", async () => {
    const set = (capabilities: string[]) =>
      http.put(url(`/members/${member.id}/capabilities`)).set(admin.auth).send({ capabilities })

    expect((await set(["KNOW_SPACE_CREATE", "KNOW_SPACE_DELETE"])).body.capabilities.sort()).toEqual([
      "KNOW_SPACE_CREATE",
      "KNOW_SPACE_DELETE",
    ])
    const me = await http.get("/api/v1/auth/me").set(member.auth).expect(200)
    expect(me.body.user.capabilities.sort()).toEqual(["KNOW_SPACE_CREATE", "KNOW_SPACE_DELETE"])

    await set(["KNOW_SPACE_DELETE", "KNOW_SPACE_DELETE"]).expect(200) // duplicates collapse
    const read = await http.get(url(`/members/${member.id}/capabilities`)).set(admin.auth).expect(200)
    expect(read.body.capabilities).toEqual(["KNOW_SPACE_DELETE"])

    await set([]).expect(200)
    expect((await http.get(url(`/members/${member.id}/capabilities`)).set(admin.auth)).body.capabilities).toEqual([])

    const entries = await prisma.auditLog.findMany({
      where: { entityId: member.id, action: "UserCapability.SET", organizationId: admin.orgId },
    })
    expect(entries).toHaveLength(3)
  })

  it("rejects unknown capabilities and capabilities of modules the organization has disabled", async () => {
    await http.put(url(`/members/${member.id}/capabilities`)).set(admin.auth).send({ capabilities: ["NOPE"] }).expect(400)

    const growOnly = await createActor(app, "cap-grow", "ADMIN")
    await prisma.organization.update({ where: { id: growOnly.orgId }, data: { enabledModules: ["GROW"] } })
    await http
      .put(url(`/members/${growOnly.id}/capabilities`))
      .set(growOnly.auth)
      .send({ capabilities: ["KNOW_SPACE_CREATE"] })
      .expect(400)
  })

  it("grants GROW_COURSE_MANAGE only while GROW is enabled and shows it on /auth/me", async () => {
    const growAdmin = await createActor(app, "cap-grow-on", "ADMIN")
    const author = await createActor(app, "cap-author", "COLLABORATOR", growAdmin.orgId)
    const set = () =>
      http
        .put(url(`/members/${author.id}/capabilities`))
        .set(growAdmin.auth)
        .send({ capabilities: ["GROW_COURSE_MANAGE"] })

    await set().expect(200)
    const me = await http.get("/api/v1/auth/me").set(author.auth).expect(200)
    expect(me.body.user.capabilities).toEqual(["GROW_COURSE_MANAGE"])

    await prisma.organization.update({ where: { id: growAdmin.orgId }, data: { enabledModules: ["KNOW"] } })
    await set().expect(400)
    const catalog = await http.get(url("/capabilities")).set(growAdmin.auth).expect(200)
    expect(catalog.body).not.toContainEqual({ capability: "GROW_COURSE_MANAGE", module: "GROW" })
  })

  it("never reaches members of another organization", async () => {
    await http.get(url(`/members/${member.id}/capabilities`)).set(outsiderAdmin.auth).expect(404)
    await http
      .put(url(`/members/${member.id}/capabilities`))
      .set(outsiderAdmin.auth)
      .send({ capabilities: ["KNOW_SPACE_CREATE"] })
      .expect(404)
    expect(await prisma.userCapability.count({ where: { userId: member.id } })).toBe(0)
  })

  it("drops capabilities when the user is deleted", async () => {
    const temp = await createActor(app, "cap-temp", "MANAGER", admin.orgId)
    await http.put(url(`/members/${temp.id}/capabilities`)).set(admin.auth).send({ capabilities: ["KNOW_SPACE_CREATE"] }).expect(200)
    await prisma.user.delete({ where: { id: temp.id } })
    expect(await prisma.userCapability.count({ where: { userId: temp.id } })).toBe(0)
  })
})
