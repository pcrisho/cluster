import { INestApplication } from "@nestjs/common"
import * as ExcelJS from "exceljs"
import { performance } from "perf_hooks"
import request from "supertest"
import { SystemPrismaService } from "../../../prisma/system-prisma.service"
import { createActor, createTestApp, type TestActor } from "../../../test-helpers"

/**
 * Apply timing of the bulk import (docs/specs/org/bulk-import, T7). Gated: runs only with IMPORT_PERF=1.
 * Run: IMPORT_PERF=1 pnpm --filter @cluster/api test:e2e -- src/modules/org/import/bulk-import.perf
 */
const run = process.env.IMPORT_PERF === "1" ? describe : describe.skip

const PEOPLE = 2000
const CLIENTS = ["Client A", "Client B"] // 2 main nodes
const UNITS = ["Ops", "Sales", "Tech"] // 3 under each main node
const SHIFTS = ["Day", "Night"] // 2 under each unit: 2 + 6 + 12 = 20 areas
const POSITIONS = ["Analyst", "Lead", "Assistant"] // global (no node)
const HEADERS = [
  "node_1",
  "node_2",
  "node_3",
  "first_name",
  "last_name",
  "email",
  "employee_code",
  "position",
  "entry_date",
  "can_create_spaces",
] as const

type Row = Record<string, string | number | null>

/** The people of the file. `changed` gives every row a new last name and another unit (a move). */
function people(tag: string, changed: boolean): Row[] {
  return Array.from({ length: PEOPLE }, (_, i) => ({
    node_1: CLIENTS[i % 2],
    node_2: UNITS[(i + (changed ? 1 : 0)) % 3],
    node_3: SHIFTS[Math.floor(i / 2) % 2],
    first_name: `Ana${i}`,
    last_name: changed ? "Changed" : "Test",
    email: `perf-${tag}-${i}@perf.test`,
    employee_code: `E${tag}-${i}`,
    position: i % 5 === 0 ? POSITIONS[i % 3] : null,
    entry_date: "2024-03-15",
    can_create_spaces: i % 10 === 0 ? "yes" : null,
  }))
}

async function workbook(rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("People")
  ws.addRow([...HEADERS])
  for (const row of rows) ws.addRow(HEADERS.map((h) => row[h] ?? null))
  return Buffer.from(await wb.xlsx.writeBuffer())
}

/** Wall clock around the whole HTTP request. */
async function timed(
  app: INestApplication,
  route: "preview" | "apply",
  admin: TestActor,
  file: Buffer,
): Promise<{ res: request.Response; ms: number }> {
  const start = performance.now()
  const res = await request(app.getHttpServer())
    .post(`/api/v1/org/import/${route}`)
    .set(admin.auth)
    .attach("file", file, "people.xlsx")
  return { res, ms: Math.round(performance.now() - start) }
}

run("Bulk import apply timing (T7)", () => {
  let app: INestApplication
  let db: SystemPrismaService

  beforeAll(async () => {
    app = await createTestApp()
    db = app.get(SystemPrismaService)
  })
  afterAll(async () => {
    await app.close()
  })

  it("2 000 new people applied (target under 30 s), then the same 2 000 changed on every row (recorded)", async () => {
    const tag = Math.random().toString(36).slice(2, 8)
    const admin = await createActor(app, "perf-admin", "ADMIN")
    for (const name of POSITIONS)
      await db.position.create({ data: { name, organizationId: admin.orgId, createdById: admin.id } })
    const orgUsers = { organizationId: admin.orgId, email: { startsWith: `perf-${tag}-` } }

    // 1. New people.
    const fresh = await workbook(people(tag, false))
    const preview1 = await timed(app, "preview", admin, fresh)
    console.log(`[import-perf] new: preview ${preview1.ms} ms`)
    expect(preview1.res.status).toBe(200)
    expect(preview1.res.body).toMatchObject({ rows: PEOPLE, create: PEOPLE, update: 0, errors: [] })

    const apply1 = await timed(app, "apply", admin, fresh)
    console.log(`[import-perf] new: apply ${apply1.ms} ms`)
    expect(apply1.res.status).toBe(200)
    expect(apply1.res.body).toMatchObject({ created: PEOPLE, updated: 0 })
    expect(await db.user.count({ where: orgUsers })).toBe(PEOPLE)
    expect(await db.orgNode.count({ where: { organizationId: admin.orgId } })).toBe(20)
    expect(apply1.ms).toBeLessThan(30_000)

    // 2. The same people: a new last name and another unit on every row.
    const changed = await workbook(people(tag, true))
    const preview2 = await timed(app, "preview", admin, changed)
    console.log(`[import-perf] updates: preview ${preview2.ms} ms`)
    expect(preview2.res.status).toBe(200)

    const apply2 = await timed(app, "apply", admin, changed)
    console.log(`[import-perf] updates: apply ${apply2.ms} ms`)
    expect(apply2.res.status).toBe(200)
    expect(apply2.res.body).toMatchObject({ created: 0, updated: PEOPLE })
    expect(await db.user.count({ where: { ...orgUsers, lastName: "Changed" } })).toBe(PEOPLE)
    expect(await db.orgNode.count({ where: { organizationId: admin.orgId } })).toBe(20)
  }, 180_000)
})
