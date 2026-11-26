import { execSync } from "child_process"
import { resolve } from "path"
import { config } from "dotenv"
import { expand } from "dotenv-expand"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import { ensureRoles } from "./db-roles"

const apiRoot = resolve(__dirname, "..")

/**
 * E2E tests never touch the dev database: they run against `<db>_test`, which
 * is dropped, recreated, migrated and seeded on every run (leftover rows from a previous run
 * could otherwise make a new constraint migration fail).
 */
export default async function globalSetup() {
  expand(config({ path: resolve(apiRoot, "../../.env") }))
  const ownerUrl = new URL(process.env.DATABASE_OWNER_URL!)
  const appUrl = new URL(process.env.DATABASE_URL!)
  const systemUrl = new URL(process.env.DATABASE_SYSTEM_URL!)
  const testDb = ownerUrl.pathname.slice(1).replace(/(_test)?$/, "_test")
  if (!testDb.endsWith("_test")) throw new Error(`Refusing to drop ${testDb}`)

  const maintenanceUrl = new URL(ownerUrl)
  maintenanceUrl.pathname = "/postgres"
  const admin = client(maintenanceUrl.toString())
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${testDb}" WITH (FORCE)`)
  await admin.$executeRawUnsafe(`CREATE DATABASE "${testDb}"`)
  await admin.$disconnect()

  ownerUrl.pathname = `/${testDb}`
  appUrl.pathname = `/${testDb}`
  systemUrl.pathname = `/${testDb}`
  // Inherited by the Jest workers; the specs' dotenv.config() does not override them.
  process.env.DATABASE_OWNER_URL = ownerUrl.toString()
  process.env.DATABASE_URL = appUrl.toString()
  process.env.DATABASE_SYSTEM_URL = systemUrl.toString()
  const env = { ...process.env }

  // The roles are cluster-wide: this sets their passwords, the migrations grant to them.
  await ensureRoles(env.DATABASE_OWNER_URL!, env.DATABASE_URL!, env.DATABASE_SYSTEM_URL!)
  execSync("npx prisma migrate deploy", { cwd: apiRoot, env, stdio: "pipe" })

  execSync("npx tsx prisma/seed.ts", { cwd: apiRoot, env, stdio: "pipe" })
}

const client = (connectionString: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
