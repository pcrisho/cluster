// Removes what the load scripts left in the storage bucket: every object of the synthetic organization.
// Run it BEFORE `db.sh teardown` (it finds the organization through a synthetic user).
//   node cleanup.mjs
import { createRequire } from "node:module"
import path from "node:path"
import { ROOT, login, perfEmail } from "./lib.mjs"

const { Client } = createRequire(path.join(ROOT, "apps/api/package.json"))("minio")
const session = await login(perfEmail(1))
const orgId = session.body?.user?.organizationId
if (!orgId) throw new Error("Could not sign in as perf1: is the stack up and the perf database seeded?")

const bucket = process.env.STORAGE_BUCKET ?? "cluster"
const client = new Client({
  endPoint: process.env.STORAGE_HOST ?? "localhost",
  port: Number(process.env.STORAGE_PORT ?? 59000),
  useSSL: false,
  accessKey: process.env.STORAGE_ACCESS_KEY ?? "perf-storage",
  secretKey: process.env.STORAGE_SECRET_KEY ?? "perf-storage-secret",
})
const keys = []
for await (const o of client.listObjectsV2(bucket, `organizations/${orgId}/`, true)) if (o.name) keys.push(o.name)
if (keys.length) await client.removeObjects(bucket, keys)
console.log(`removed ${keys.length} objects of organization ${orgId}`)
