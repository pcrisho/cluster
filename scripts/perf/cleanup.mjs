// Removes what the load scripts left in the storage bucket: every object of the synthetic organization.
// Run it BEFORE `db.sh teardown` (it finds the organization through a synthetic user).
//   node cleanup.mjs
import { createRequire } from "node:module"
import path from "node:path"
import { ROOT, login, perfEmail } from "./lib.mjs"

const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = createRequire(
  path.join(ROOT, "apps/api/package.json"),
)("@aws-sdk/client-s3")
const session = await login(perfEmail(1))
const orgId = session.body?.user?.organizationId
if (!orgId) throw new Error("Could not sign in as perf1: is the stack up and the perf database seeded?")

const bucket = process.env.STORAGE_BUCKET ?? "cluster"
const host = process.env.STORAGE_HOST ?? "localhost"
const port = Number(process.env.STORAGE_PORT ?? 59000)
const client = new S3Client({
  region: "us-east-1",
  endpoint: `http://${host}:${port}`,
  forcePathStyle: true,
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY ?? "perf-storage",
    secretAccessKey: process.env.STORAGE_SECRET_KEY ?? "perf-storage-secret",
  },
})

const keys = []
let continuationToken
do {
  const res = await client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: `organizations/${orgId}/`,
      ContinuationToken: continuationToken,
    }),
  )
  for (const o of res.Contents ?? []) if (o.Key) keys.push({ Key: o.Key })
  continuationToken = res.IsTruncated ? res.NextContinuationToken : undefined
} while (continuationToken)

for (let i = 0; i < keys.length; i += 1000) {
  await client.send(
    new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: { Objects: keys.slice(i, i + 1000), Quiet: true },
    }),
  )
}
console.log(`removed ${keys.length} objects of organization ${orgId}`)
