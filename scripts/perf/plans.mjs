// Plans of the critical reads of the RLS spec (docs/specs/org/rls, T11/T12), as the API runs them.
// Needs `db.sh setup && db.sh orgs`, auto_explain on for cluster_app (README "Query plans") and `stack.sh start`.
// Each read is called once to warm the caches, then once more; the plans Postgres logged for that second
// call are written to <out-dir>/<read>.txt.
//   node plans.mjs <out-dir>
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { ADMIN, API, bearer, getJson, login, sleep } from "./lib.mjs"

const out = process.argv[2]
if (!out) throw new Error("usage: node plans.mjs <out-dir>")
fs.mkdirSync(out, { recursive: true })

const admin = (await login(ADMIN.email, ADMIN.password)).token
const person = (await login("perf1@cluster.example")).token
const big = (await getJson("/know/spaces", admin)).data.find((s) => s.name === "Space 1")
const area = (await getJson("/org/areas", admin)).data.find((a) => a.name === "Perf area 1")

const reads = {
  "directory": [person, "/connect/directory"],
  "directory-search": [person, "/connect/directory?search=perf"],
  "directory-area": [person, `/connect/directory?orgNodeIds=${area.id}`],
  "activity": [admin, "/org/activity"],
  "know-page-tree": [person, `/know/spaces/${big.id}/pages`],
  "know-page-search": [person, "/know/pages/search?q=Page%2012"],
  "know-search-common": [person, "/know/search?q=lorem"],
  "know-search-selective": [person, "/know/search?q=202cb9"],
  "know-search-none": [person, "/know/search?q=zzzqnomatch"],
  "grow-learning": [person, "/grow/learning"],
  "grow-pending": [person, "/grow/learning/pending"],
  "grow-report": [admin, "/grow/reports/compliance"],
  "grow-dashboard": [admin, "/grow/reports/compliance/dashboard"],
  "notifications": [person, "/notifications"],
  "connect-feed": [person, "/connect/feed"],
}

for (const [name, [token, url]] of Object.entries(reads)) {
  const call = async () => {
    const r = await fetch(API + url, { headers: bearer(token) })
    if (!r.ok) throw new Error(`${name}: ${url} answered ${r.status}`)
    await r.arrayBuffer()
  }
  await call()
  await sleep(1100) // docker logs --since has one-second resolution
  const since = new Date().toISOString()
  await call()
  await sleep(500)
  const logs = spawnSync("docker", ["logs", "--since", since, "perf-postgres"], { encoding: "utf8" })
  const text = logs.stdout + logs.stderr // Postgres logs to stderr
  fs.writeFileSync(path.join(out, `${name}.txt`), `# GET ${url}\n\n${text}`)
  console.log(`${name}: ${(text.match(/duration: /g) ?? []).length} plans`)
}
