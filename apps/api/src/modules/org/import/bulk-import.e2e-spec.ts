import { INestApplication } from "@nestjs/common"
import { createHash } from "crypto"
import * as ExcelJS from "exceljs"
import request from "supertest"
import { SystemPrismaService } from "../../../prisma/system-prisma.service"
import { createActor, createTestApp, type TestActor } from "../../../test-helpers"
import { AuthService } from "../../auth/auth.service"
import { InvitationService } from "../../auth/invitation.service"
import { IMPORT_COLUMNS } from "./import-types"

type Row = Record<string, string | number | boolean | null>

/** A workbook as the ADMIN would fill it: header row, then one object per row. */
async function xlsx(rows: Row[], headers: readonly string[] = IMPORT_COLUMNS): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("People")
  ws.addRow([...headers])
  for (const row of rows) ws.addRow(headers.map((h) => row[h] ?? null))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

const uid = () => Math.random().toString(36).slice(2, 8)
const binary = (res: request.Response, cb: (err: Error | null, body: unknown) => void) => {
  const chunks: Buffer[] = []
  res.on("data", (c: Buffer) => chunks.push(c))
  res.on("end", () => {
    const body = Buffer.concat(chunks)
    cb(null, String(res.headers["content-type"] ?? "").includes("json") ? JSON.parse(body.toString("utf8")) : body)
  })
}

/** Bulk import of members and nodes (docs/specs/org/bulk-import): preview writes nothing, apply is all or nothing. */
describe("Bulk import e2e", () => {
  let app: INestApplication
  let db: SystemPrismaService
  let tag: string

  beforeAll(async () => {
    app = await createTestApp()
    db = app.get(SystemPrismaService)
  })
  beforeEach(() => {
    tag = uid()
  })
  afterEach(() => jest.restoreAllMocks())
  afterAll(async () => {
    await app.close()
  })

  const code = (prefix: string) => `${prefix}${tag}`.toUpperCase()
  const email = (n: string | number) => `imp-${tag}-${n}@imp.test`
  const person = (n: string | number, over: Row = {}): Row => ({
    node_1: `Acme ${tag}`,
    first_name: `Ana${n}`,
    last_name: "Test",
    email: email(n),
    ...over,
  })
  /** A fresh organization and ADMIN per test, so the per-person throttles never meet. */
  const newAdmin = () => createActor(app, "imp-admin", "ADMIN")
  const post = (route: "preview" | "apply", admin: TestActor, file: Buffer, sendInvitations?: boolean) => {
    const req = request(app.getHttpServer()).post(`/api/v1/org/import/${route}`).set(admin.auth)
    if (sendInvitations !== undefined) req.field("sendInvitations", String(sendInvitations))
    return req.attach("file", file, "people.xlsx")
  }
  const counts = async (orgId: string) => ({
    users: await db.user.count({ where: { organizationId: orgId } }),
    nodes: await db.orgNode.count({ where: { organizationId: orgId } }),
    profiles: await db.userProfile.count({ where: { organizationId: orgId } }),
    audits: await db.auditLog.count({ where: { organizationId: orgId, action: "Organization.IMPORT_MEMBERS" } }),
  })
  const byEmail = (n: string | number) =>
    db.user.findUniqueOrThrow({
      where: { email: email(n) },
      include: { profile: true, capabilities: true, managedOrgNodes: true },
    })

  it("preview writes nothing", async () => {
    const admin = await newAdmin()
    const before = await counts(admin.orgId)
    const res = await post("preview", admin, await xlsx([person(1, { node_2: "Ops" }), person(2)])).expect(200)
    expect(res.body).toMatchObject({ rows: 2, create: 2, update: 0, errors: [] })
    expect(res.body.nodesToCreate).toEqual([[`Acme ${tag}`], [`Acme ${tag}`, "Ops"]])
    expect(await counts(admin.orgId)).toEqual(before)
  })

  it("applies two main nodes, three levels and 50 people in one go, then updates by e-mail on the second run", async () => {
    const admin = await newAdmin()
    await db.position.create({
      data: { name: "Analyst", organizationId: admin.orgId, createdById: admin.id },
    })
    const people: Row[] = Array.from({ length: 50 }, (_, i) => {
      const main = i % 2 === 0 ? "Client A" : "Client B"
      return person(i, {
        node_1: `${main} ${tag}`,
        node_1_code: main === "Client A" ? code("CA") : code("CB"),
        node_2: "Operations",
        node_3: i < 10 ? "Night" : "Day",
        position: i < 5 ? "analyst" : null,
        employee_code: `E${tag}-${i}`,
        entry_date: "2024-03-15",
        can_create_spaces: i === 1 ? "yes" : null,
      })
    })
    const file = await xlsx(people)
    const res = await post("apply", admin, file, false).expect(200)
    expect(res.body).toMatchObject({ created: 50, updated: 0 })
    expect(res.body.mainNodeIds).toHaveLength(2)

    // 2 main nodes + Operations under each + Night/Day: A holds i%2==0 (Night: 0,2,4,6,8 and Day), B too.
    expect(await db.orgNode.count({ where: { organizationId: admin.orgId } })).toBe(2 + 2 + 4)
    const created = await db.user.findMany({
      where: { organizationId: admin.orgId, email: { startsWith: `imp-${tag}-` } },
      include: { profile: true, capabilities: true },
    })
    expect(created).toHaveLength(50)
    expect(
      created.every((u) => u.role === "COLLABORATOR" && u.passwordSetAt === null && u.inviteQueuedAt === null),
    ).toBe(true)
    expect(created.every((u) => u.profile?.orgNodeId && u.profile.organizationId === admin.orgId)).toBe(true)
    expect(created.filter((u) => u.profile?.positionId)).toHaveLength(5)
    const ana1 = await byEmail(1)
    expect(ana1.capabilities.map((c) => c.capability)).toEqual(["KNOW_SPACE_CREATE"])
    expect(ana1.capabilities[0].grantedById).toBe(admin.id)
    expect(ana1.orgColaboratorId).toBe(`E${tag}-1`)
    expect(ana1.profile?.joinedAt.toISOString().slice(0, 10)).toBe("2024-03-15")
    expect(
      await db.orgNode.findFirstOrThrow({ where: { organizationId: admin.orgId, code: code("CA") } }),
    ).toMatchObject({
      external: false,
      parentId: null,
    })

    // Second run: one rename, one move, one new person; the rest is unchanged and nothing is created twice.
    const again = people.map((p, i) =>
      i === 3 ? { ...p, first_name: "Renamed" } : i === 4 ? { ...p, node_3: "Weekend" } : p,
    )
    again.push(person(99, { node_1: `Client A ${tag}`, node_1_code: code("CA"), node_2: "Operations", node_3: "Day" }))
    const second = await post("apply", admin, await xlsx(again), false).expect(200)
    expect(second.body).toMatchObject({ created: 1, updated: 2 })
    expect(second.body.report.unchanged).toBe(48)
    expect(await db.user.count({ where: { organizationId: admin.orgId } })).toBe(1 + 51)
    expect((await byEmail(3)).firstName).toBe("Renamed")
    expect(await db.orgNode.count({ where: { organizationId: admin.orgId, name: "Weekend" } })).toBe(1)
    expect(
      await db.auditLog.count({ where: { organizationId: admin.orgId, action: "Organization.IMPORT_MEMBERS" } }),
    ).toBe(2)
  })

  it("a blocking error answers 422 with the report and leaves the database untouched", async () => {
    const admin = await newAdmin()
    const before = await counts(admin.orgId)
    const res = await post(
      "apply",
      admin,
      await xlsx([person(1, { node_2: "Ops" }), person(2, { email: "not-an-email" })]),
    ).expect(422)
    expect(res.body).toMatchObject({ code: "IMPORT_INVALID" })
    expect(res.body.report.errors).toEqual([expect.objectContaining({ row: 3, column: "email" })])
    expect(await counts(admin.orgId)).toEqual(before)
  })

  it("an address of another organization is EMAIL_UNAVAILABLE and the report never names the organization", async () => {
    const admin = await newAdmin()
    const other = await createActor(app, "imp-other", "COLLABORATOR")
    const otherUser = await db.user.findUniqueOrThrow({ where: { id: other.id }, include: { organization: true } })
    const res = await post("preview", admin, await xlsx([person(1, { email: otherUser.email })])).expect(200)
    expect(res.body.errors).toEqual([expect.objectContaining({ row: 2, column: "email", code: "EMAIL_UNAVAILABLE" })])
    const text = JSON.stringify(res.body)
    expect(text).not.toContain(otherUser.organization.name)
    expect(text).not.toContain(other.orgId)
  })

  it("never matches another organization's nodes or positions, even with the same names", async () => {
    const admin = await newAdmin()
    const other = await createActor(app, "imp-other", "ADMIN")
    const theirs = await db.orgNode.create({
      data: { name: `Acme ${tag}`, code: code("X"), organizationId: other.orgId },
    })
    await db.position.create({ data: { name: "Analyst", organizationId: other.orgId, createdById: other.id } })

    const res = await post("preview", admin, await xlsx([person(1, { position: "Analyst" })])).expect(200)
    expect(res.body.nodesToCreate).toEqual([[`Acme ${tag}`]])
    expect(res.body.errors).toEqual([expect.objectContaining({ code: "POSITION_NOT_FOUND" })])

    // The same code is theirs alone: here it creates a main node of our own.
    const withCode = await post(
      "apply",
      admin,
      await xlsx([person(1, { node_1_code: code("X").toLowerCase() })]),
      false,
    ).expect(200)
    expect(withCode.body.created).toBe(1)
    const mine = await db.orgNode.findFirstOrThrow({ where: { organizationId: admin.orgId } })
    expect(mine.id).not.toBe(theirs.id)
    expect((await byEmail(1)).profile?.orgNodeId).toBe(mine.id)
  })

  it("node_1_code finds a renamed main node and does not rename it", async () => {
    const admin = await newAdmin()
    const main = await db.orgNode.create({
      data: { name: "Renamed Co", code: code("CO"), organizationId: admin.orgId },
    })
    const file = await xlsx([person(1, { node_1: "Original Co", node_1_code: code("CO").toLowerCase() })])
    const preview = await post("preview", admin, file).expect(200)
    expect(preview.body.errors).toEqual([])
    expect(preview.body.warnings).toEqual([expect.objectContaining({ code: "NODE_NAME_DIFFERS" })])
    await post("apply", admin, file, false).expect(200)
    expect((await db.orgNode.findUniqueOrThrow({ where: { id: main.id } })).name).toBe("Renamed Co")
    expect((await byEmail(1)).profile?.orgNodeId).toBe(main.id)
    expect(await db.orgNode.count({ where: { organizationId: admin.orgId } })).toBe(1)
  })

  it("catches a gap, an ambiguous node and an archived node", async () => {
    const admin = await newAdmin()
    const main = await db.orgNode.create({ data: { name: `Acme ${tag}`, organizationId: admin.orgId } })
    await db.orgNode.createMany({
      data: [
        { name: "Sales", parentId: main.id, organizationId: admin.orgId },
        { name: "SALES", parentId: main.id, organizationId: admin.orgId },
        { name: "Old", parentId: main.id, organizationId: admin.orgId, isActive: false, archivedAt: new Date() },
      ],
    })
    const res = await post(
      "preview",
      admin,
      await xlsx([person(1, { node_3: "Deep" }), person(2, { node_2: "sales" }), person(3, { node_2: "Old" })]),
    ).expect(200)
    const codes = Object.fromEntries(res.body.errors.map((e: { row: number; code: string }) => [e.row, e.code]))
    expect(codes).toEqual({ 2: "NODE_GAP", 3: "NODE_AMBIGUOUS", 4: "NODE_ARCHIVED" })
  })

  it("clears a position scoped to the old node on a move, and a manager flag releases the old node", async () => {
    const admin = await newAdmin()
    const main = await db.orgNode.create({ data: { name: `Acme ${tag}`, organizationId: admin.orgId } })
    const x = await db.orgNode.create({ data: { name: "X", parentId: main.id, organizationId: admin.orgId } })
    await db.orgNode.create({ data: { name: "Y", parentId: main.id, organizationId: admin.orgId } })
    const scoped = await db.position.create({
      data: { name: "Lead", orgNodeId: x.id, organizationId: admin.orgId, createdById: admin.id },
    })
    const member = await createActor(app, "imp-member", "COLLABORATOR", admin.orgId)
    const user = await db.user.findUniqueOrThrow({ where: { id: member.id } })
    await db.userProfile.create({
      data: { userId: member.id, organizationId: admin.orgId, orgNodeId: x.id, positionId: scoped.id },
    })
    await db.orgNode.update({ where: { id: x.id }, data: { managerId: member.id } })

    const file = await xlsx([{ node_1: `Acme ${tag}`, node_2: "Y", email: user.email, is_node_manager: "yes" }])
    const preview = await post("preview", admin, file).expect(200)
    expect(preview.body.warnings.map((w: { code: string }) => w.code).sort()).toEqual([
      "MANAGER_RELEASED",
      "POSITION_CLEARED",
    ])
    await post("apply", admin, file, false).expect(200)

    const y = await db.orgNode.findFirstOrThrow({ where: { organizationId: admin.orgId, name: "Y" } })
    expect((await db.orgNode.findUniqueOrThrow({ where: { id: x.id } })).managerId).toBeNull()
    expect(y.managerId).toBe(member.id)
    expect(await db.userProfile.findUniqueOrThrow({ where: { userId: member.id } })).toMatchObject({
      orgNodeId: y.id,
      positionId: null,
    })
  })

  it("never changes the role of an existing member", async () => {
    const admin = await newAdmin()
    const moderator = await createActor(app, "imp-mod", "MANAGER", admin.orgId)
    const emails = await db.user.findMany({ where: { id: { in: [admin.id, moderator.id] } } })
    const rows = emails.map((u) => ({ node_1: `Acme ${tag}`, email: u.email }))
    await post("apply", admin, await xlsx(rows), false).expect(200)
    const after = await db.user.findMany({ where: { id: { in: [admin.id, moderator.id] } }, orderBy: { role: "asc" } })
    expect(after.map((u) => u.role).sort()).toEqual(["ADMIN", "MANAGER"])
  })

  it("moves assignmentChangedAt only on a real change of node or position", async () => {
    const admin = await newAdmin()
    const file = (over: Row) => xlsx([person(1, over)])
    await post("apply", admin, await file({}), false).expect(200)
    const stamp = new Date("2020-01-01T00:00:00Z")
    const profileId = (await byEmail(1)).profile!.id
    await db.userProfile.update({ where: { id: profileId }, data: { assignmentChangedAt: stamp } })

    await post("apply", admin, await xlsx([person(1, { first_name: "Other" })]), false).expect(200)
    expect((await byEmail(1)).profile?.assignmentChangedAt).toEqual(stamp)
    await post("apply", admin, await xlsx([person(1, { node_2: "Moved" })]), false).expect(200)
    expect((await byEmail(1)).profile!.assignmentChangedAt!.getTime()).toBeGreaterThan(stamp.getTime())
  })

  describe("invitations", () => {
    /** The queue is global and a timer may send: leave nothing queued for fake addresses. */
    const unqueue = () =>
      db.user.updateMany({ where: { email: { startsWith: `imp-${tag}-` } }, data: { inviteQueuedAt: null } })

    it("sendInvitations queues the new members when mail is on", async () => {
      const admin = await newAdmin()
      await post("apply", admin, await xlsx([person(1), person(2)]), true).expect(200)
      const queued = await db.user.count({
        where: { email: { startsWith: `imp-${tag}-` }, inviteQueuedAt: { not: null } },
      })
      await unqueue()
      expect(queued).toBe(2)
    })

    it("sendInvitations while mail is off answers 409 and writes nothing", async () => {
      const admin = await newAdmin()
      jest.spyOn(app.get(InvitationService), "mailEnabled", "get").mockReturnValue(false)
      const before = await counts(admin.orgId)
      const res = await post("apply", admin, await xlsx([person(1)]), true).expect(409)
      expect(res.body.code).toBe("MAIL_DISABLED")
      expect(await counts(admin.orgId)).toEqual(before)
      // Without the option the import goes through and nobody is queued.
      await post("apply", admin, await xlsx([person(1)]), false).expect(200)
      expect((await byEmail(1)).inviteQueuedAt).toBeNull()
    })
  })

  it("writes one audit row with the file hash and the counts", async () => {
    const admin = await newAdmin()
    const file = await xlsx([person(1, { node_2: "Ops" }), person(2)])
    await post("apply", admin, file, false).expect(200)
    const rows = await db.auditLog.findMany({
      where: { organizationId: admin.orgId, action: "Organization.IMPORT_MEMBERS" },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ actorId: admin.id, entityType: "Organization", entityId: admin.orgId })
    expect(rows[0].newValues).toMatchObject({
      fileName: "people.xlsx",
      sha256: createHash("sha256").update(file).digest("hex"),
      created: 2,
      updated: 0,
      sendInvitations: false,
      emailsCreated: [email(1), email(2)],
      emailsUpdated: [],
    })
    // Preview leaves no audit row of its own.
    await post("preview", admin, file).expect(200)
    expect(
      await db.auditLog.count({ where: { organizationId: admin.orgId, action: "Organization.IMPORT_MEMBERS" } }),
    ).toBe(1)
  })

  it("a conflict while writing (an address taken meanwhile) answers 409 IMPORT_CONFLICT and rolls everything back", async () => {
    const admin = await newAdmin()
    const rival = await createActor(app, "imp-rival", "COLLABORATOR")
    const auth = app.get(AuthService)
    const real = auth.createAccounts.bind(auth)
    jest.spyOn(auth, "createAccounts").mockImplementationOnce(async (rows, tx) => {
      await db.user.create({
        data: {
          email: rows[0].email,
          passwordHash: "x",
          firstName: "Race",
          lastName: "Won",
          organizationId: rival.orgId,
        },
      })
      return real(rows, tx)
    })
    const before = await counts(admin.orgId)
    const res = await post("apply", admin, await xlsx([person(1, { node_2: "Ops" })]), false).expect(409)
    expect(res.body.code).toBe("IMPORT_CONFLICT")
    expect(await counts(admin.orgId)).toEqual(before)
  })

  it("is ADMIN only on all three routes", async () => {
    const admin = await newAdmin()
    const member = await createActor(app, "imp-member", "COLLABORATOR", admin.orgId)
    const file = await xlsx([person(1)])
    await request(app.getHttpServer()).get("/api/v1/org/import/template").set(member.auth).expect(403)
    await post("preview", member, file).expect(403)
    await post("apply", member, file, false).expect(403)
    expect(await db.user.count({ where: { email: email(1) } })).toBe(0)
  })

  describe("limits", () => {
    it("refuses 2001 rows and 31 columns with IMPORT_TOO_LARGE", async () => {
      const rows = Array.from({ length: 2001 }, (_, i) => person(i))
      const tooMany = await post("preview", await newAdmin(), await xlsx(rows)).expect(400)
      expect(tooMany.body.code).toBe("IMPORT_TOO_LARGE")
      const wide = [...IMPORT_COLUMNS, ...Array.from({ length: 31 - IMPORT_COLUMNS.length }, (_, i) => `extra_${i}`)]
      const tooWide = await post("preview", await newAdmin(), await xlsx([person(1)], wide)).expect(400)
      expect(tooWide.body.code).toBe("IMPORT_TOO_LARGE")
    })

    it("refuses missing headers with IMPORT_HEADERS", async () => {
      const res = await post("preview", await newAdmin(), await xlsx([person(1)], ["first_name", "email"])).expect(400)
      expect(res.body.code).toBe("IMPORT_HEADERS")
    })

    it("refuses a non-xlsx renamed .xlsx and a 6 MB file", async () => {
      const fake = await post("preview", await newAdmin(), Buffer.from("name,email\nAna,ana@x.com\n")).expect(400)
      expect(fake.body.code).toBe("SPREADSHEET_TYPE_UNSUPPORTED")
      const big = await post("preview", await newAdmin(), Buffer.alloc(6 * 1024 * 1024, 1)).expect(413)
      expect(big.body.code).toBe("SPREADSHEET_TOO_LARGE")
    })
  })

  describe("template", () => {
    const download = async (admin: TestActor) => {
      const res = await request(app.getHttpServer())
        .get("/api/v1/org/import/template")
        .set(admin.auth)
        .buffer(true)
        .parse(binary)
        .expect(200)
      expect(res.headers["content-disposition"]).toContain("cluster-import.xlsx")
      expect(res.headers["cache-control"]).toContain("no-store")
      const wb = new ExcelJS.Workbook()
      await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer)
      return wb
    }
    const instructions = (wb: ExcelJS.Workbook) =>
      (wb.worksheets[1].getSheetValues() as unknown[])
        .flat()
        .filter((v) => typeof v === "string")
        .join("\n")

    it("has the fixed headers on sheet one and instructions on sheet two, in the ADMIN's language", async () => {
      const admin = await newAdmin()
      const en = await download(admin)
      expect((en.worksheets[0].getRow(1).values as unknown[]).slice(1)).toEqual([...IMPORT_COLUMNS])
      await db.user.update({ where: { id: admin.id }, data: { locale: "es" } })
      const es = await download(admin)
      expect((es.worksheets[0].getRow(1).values as unknown[]).slice(1)).toEqual([...IMPORT_COLUMNS])
      expect(instructions(en)).not.toBe("")
      expect(instructions(es)).not.toBe("")
      expect(instructions(es)).not.toBe(instructions(en))
    })

    it("the template reads back through preview as an empty, valid file", async () => {
      const admin = await newAdmin()
      const wb = await download(admin)
      const res = await post("preview", admin, Buffer.from(await wb.xlsx.writeBuffer())).expect(200)
      expect(res.body).toMatchObject({ rows: 0, errors: [] })
    })
  })
})
