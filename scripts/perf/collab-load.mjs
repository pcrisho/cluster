// Realtime editing: many connections to few pages (every page view opens one, readers included),
// a few people typing. One WebSocket per connection, like the browser.
//   node collab-load.mjs [readers=90] [editors=10] [docs=20] [seconds=45]
// Editors sign in as the admin (a reader cannot type); readers are the synthetic users.
import { createRequire } from "node:module"
import path from "node:path"
import {
  ADMIN, API, COLLAB, ROOT, bearer, cpuSeconds, fmtPg, getJson, login, pct, pgSeconds, pidOfPort, rssMB, sleep, tokens,
} from "./lib.mjs"

// The provider and ws are devDependencies of apps/collab
const req = createRequire(path.join(ROOT, "apps/collab/package.json"))
const { HocuspocusProvider, HocuspocusProviderWebsocket } = await import(req.resolve("@hocuspocus/provider"))
const WS = req("ws")
const Y = req("yjs")
const ORIGIN = process.env.PERF_ORIGIN ?? "http://localhost:3000" // must be in COLLAB_ALLOWED_ORIGINS
class OriginWS extends WS {
  constructor(url, protocols) {
    super(url, protocols, { headers: { Origin: ORIGIN } })
  }
}

const READERS = Number(process.argv[2] ?? 90)
const EDITORS = Number(process.argv[3] ?? 10)
const DOCS = Number(process.argv[4] ?? 20)
const DURATION = Number(process.argv[5] ?? 45) * 1000
const collabPid = pidOfPort(COLLAB)
const apiPid = pidOfPort(API)

const users = await tokens()
const admin = (await login(ADMIN.email, ADMIN.password)).token
const spaces = (await getJson("/know/spaces", admin)).data.filter((s) => s.name !== "Space 1" && !s.restricted)
const docs = []
for (const s of spaces) docs.push(...(await getJson(`/know/spaces/${s.id}/pages`, admin)).data.slice(0, 5).map((p) => p.id))
docs.length = Math.min(docs.length, DOCS)
console.log(`${docs.length} documents`)

const syncMs = []
const failures = []
const open = (docId, token) =>
  new Promise((resolve) => {
    const t = performance.now()
    const ydoc = new Y.Doc()
    const websocket = new HocuspocusProviderWebsocket({ url: COLLAB, WebSocketPolyfill: OriginWS })
    const provider = new HocuspocusProvider({
      websocketProvider: websocket,
      name: `know.page:${docId}`,
      document: ydoc,
      token,
      onSynced: () => {
        syncMs.push(performance.now() - t)
        resolve({ provider, ydoc, websocket })
      },
      onAuthenticationFailed: (e) => {
        failures.push(e.reason)
        resolve(null)
      },
    })
    provider.attach()
    setTimeout(() => resolve(null), 20000)
  })

const c0 = cpuSeconds(collabPid), a0 = cpuSeconds(apiPid), p0 = pgSeconds(), w0 = performance.now()
const jobs = [
  ...Array.from({ length: EDITORS }, (_, i) => ({ doc: docs[i % Math.min(5, docs.length)], token: admin, editor: true })),
  ...Array.from({ length: READERS }, (_, i) => ({ doc: docs[i % docs.length], token: users[i % users.length].token })),
]
const conns = []
for (let i = 0; i < jobs.length; i += 10) {
  // waves of 10, like a morning ramp
  const wave = await Promise.all(jobs.slice(i, i + 10).map((j) => open(j.doc, j.token).then((c) => c && { ...c, editor: j.editor })))
  conns.push(...wave.filter(Boolean))
}
console.log(
  `connected ${conns.length}/${jobs.length}  sync p50=${pct(syncMs, 0.5)}ms p95=${pct(syncMs, 0.95)}ms  failures=${[...new Set(failures)]}  collab rss=${rssMB(collabPid)}MB`,
)

let edits = 0
const end = Date.now() + DURATION
const typers = conns.filter((c) => c.editor)
await Promise.all(
  typers.map(async (c) => {
    const body = c.ydoc.getXmlFragment("body")
    while (Date.now() < end) {
      try {
        const text = body.get(0)?.get?.(0)
        if (text?.insert) {
          text.insert(0, "x")
          edits++
        }
      } catch {
        // the document is being replaced: try again next tick
      }
      await sleep(250 + Math.random() * 250)
    }
  }),
)
const wall = (performance.now() - w0) / 1000
const pg = pgSeconds() === null ? null : pgSeconds() - p0
console.log(
  `edits=${edits} (${typers.length} editors)  collab-cpu=${(((cpuSeconds(collabPid) - c0) / wall) * 100).toFixed(1)}%  ` +
    `api-cpu=${(((cpuSeconds(apiPid) - a0) / wall) * 100).toFixed(1)}%  pg-cpu=${fmtPg(pg, wall)}  ` +
    `collab-rss=${rssMB(collabPid)}MB  api-rss=${rssMB(apiPid)}MB`,
)
console.log("collab health:", await (await fetch(COLLAB.replace(/^ws/, "http") + "/health")).text())
for (const c of conns) {
  c.provider.destroy()
  c.websocket.destroy()
}
await sleep(3000)
console.log("after closing:", await (await fetch(COLLAB.replace(/^ws/, "http") + "/health")).text())
process.exit(0)
