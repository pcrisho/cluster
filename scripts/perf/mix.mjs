// A realistic mix of N signed-in people. Each one:
//   - holds 2 Socket.IO connections (notifications and feed) and 1 live-editing connection (the page they have open);
//   - every ~E seconds does something: open a page (tree + page + 2 images), feed, learning, directory, catalog or search;
//   - polls unread notifications every 30 s.
// Reports latency per action, the CPU of the whole box (API, collab, web, Postgres, Redis, storage), its memory,
// and a verdict against the limits below. Optionally a login storm at t=20 s.
//   node mix.mjs [action-every-seconds=15] [duration-seconds=60] [users=100] [storm-logins=0]
// 15 s is ordinary use, 5 s busy, 3 s aggressive. More than 100 users reuse the 100 synthetic accounts.
// Run it from other cores than the box (taskset -c 8-11 node mix.mjs ...), or the generator steals CPU from it.
import { createRequire } from "node:module"
import { monitorEventLoopDelay } from "node:perf_hooks"
import path from "node:path"
import {
  API, COLLAB, ROOT, bearer, boxCores, coresBusySeconds, diff, getJson, login, makeBox, perfEmail, pick, pct, sleep, sum, tokens, uploadTinyPng,
} from "./lib.mjs"

const EVERY = Number(process.argv[2] ?? 15) * 1000
const DURATION = Number(process.argv[3] ?? 60) * 1000
const VUS = Number(process.argv[4] ?? 100)
// A term that appears in a handful of pages (seeded text), like a real query. "lorem" is in all of them.
const SEARCH_Q = process.env.PERF_SEARCH_Q ?? "202cb9"
const STORM = Number(process.argv[5] ?? 0)
const CORES = Number(process.env.PERF_CORES ?? 1)
// "Copes" means: every kind of action stays under these latencies, nothing fails and nothing is killed.
// Search is judged apart: it is occasional and heavy (a scan of every page, see BASELINE.md), so it gets more room.
const LIMITS = { p95: Number(process.env.PERF_P95_MS ?? 500), p99: Number(process.env.PERF_P99_MS ?? 1500) }
const SEARCH_LIMITS = { p95: Number(process.env.PERF_SEARCH_P95_MS ?? 2000), p99: Number(process.env.PERF_SEARCH_P99_MS ?? 4000) }

const origin = new URL(API).origin
const { io } = createRequire(path.join(ROOT, "apps/web/package.json"))("socket.io-client")
const collabRequire = createRequire(path.join(ROOT, "apps/collab/package.json"))
const { HocuspocusProvider, HocuspocusProviderWebsocket } = await import(collabRequire.resolve("@hocuspocus/provider"))
const WS = collabRequire("ws")
const Y = collabRequire("yjs")
class OriginWS extends WS {
  constructor(url, protocols) {
    super(url, protocols, { headers: { Origin: process.env.PERF_ORIGIN ?? "http://localhost:3000" } })
  }
}

const box = makeBox()
const users = await tokens()
const first = users[0].token
const spaces = (await getJson("/know/spaces", first)).data
const pages = {}
for (const s of spaces) pages[s.id] = (await getJson(`/know/spaces/${s.id}/pages`, first)).data.slice(0, 20).map((p) => p.id)
const fileKey = await uploadTinyPng(first)

const lat = {}
let total = 0, errors = 0
async function call(name, p, token) {
  const s = performance.now()
  try {
    const r = await fetch(API + p, { headers: bearer(token) })
    await r.arrayBuffer()
    if (r.status >= 400) errors++
  } catch {
    errors++
  }
  ;(lat[name] ??= []).push(performance.now() - s)
  total++
}
const actions = [
  [30, async (t) => {
    const sp = pick(spaces)
    await call("page view: tree", `/know/spaces/${sp.id}/pages`, t)
    const id = pick(pages[sp.id])
    await Promise.all([
      call("page view: page", `/know/pages/${id}`, t),
      call("page view: img", `/files/${fileKey}`, t),
      call("page view: img", `/files/${fileKey}`, t),
    ])
  }],
  [10, (t) => call("know spaces", "/know/spaces", t)],
  [20, (t) => call("feed", "/connect/feed", t)],
  [15, (t) => call("grow learning", "/grow/learning", t)],
  [10, (t) => call("directory", "/connect/directory", t)],
  [process.env.PERF_NO_SEARCH ? 0 : 5, (t) => call("know search", `/know/search?q=${SEARCH_Q}`, t)],
  [10, (t) => call("grow catalog", "/grow/catalog", t)],
]
const bag = actions.flatMap(([w, f]) => Array(w).fill(f))

// Connections each person keeps open
const held = []
let sockets = 0, live = 0
function hold(token) {
  for (let i = 0; i < 2; i++) {
    const s = io(origin, { auth: { token }, transports: ["websocket"], reconnection: false })
    s.on("connect", () => sockets++)
    held.push(() => s.disconnect())
  }
  const sp = pick(spaces)
  const websocket = new HocuspocusProviderWebsocket({ url: COLLAB, WebSocketPolyfill: OriginWS })
  const provider = new HocuspocusProvider({
    websocketProvider: websocket,
    name: `know.page:${pick(pages[sp.id])}`,
    document: new Y.Doc(),
    token,
    onSynced: () => live++,
  })
  provider.attach()
  held.push(() => {
    provider.destroy()
    websocket.destroy()
  })
}
for (let i = 0; i < VUS; i += 10) {
  for (let k = i; k < Math.min(i + 10, VUS); k++) hold(users[k % users.length].token)
  await sleep(300)
}
await sleep(3000)

let stop = false
async function person(i) {
  const token = users[i % users.length].token
  await sleep(Math.random() * EVERY)
  let nextPoll = Date.now() + Math.random() * 30000
  while (!stop) {
    if (Date.now() >= nextPoll) {
      await call("notif poll", "/notifications/unread-count", token)
      nextPoll = Date.now() + 30000
    }
    await pick(bag)(token)
    await sleep(EVERY * (0.5 + Math.random()))
  }
}

const cores = boxCores()
const busy0 = cores.length ? coresBusySeconds(cores) : 0
const loop = monitorEventLoopDelay({ resolution: 10 })
loop.enable()
const c0 = box.cpu()
const w0 = performance.now()
let peak = sum(box.mem())
let peakMem = box.mem()
const sampler = setInterval(() => {
  const m = box.mem()
  if (sum(m) > peak) {
    peak = sum(m)
    peakMem = m
  }
}, 2000)
setTimeout(() => (stop = true), DURATION)
let storm = []
if (STORM) {
  setTimeout(async () => {
    storm = (await Promise.all(Array.from({ length: STORM }, (_, i) => login(perfEmail(i + 1))))).map((r) => r.ms)
  }, 20000)
}
await Promise.all(Array.from({ length: VUS }, (_, i) => person(i)))
clearInterval(sampler)
const wall = (performance.now() - w0) / 1000
loop.disable()
// If the generator itself stalls, the latencies it measures are its own: the run says so instead of blaming the server
const lagP99 = Math.round(loop.percentile(99) / 1e6)
const lagMax = Math.round(loop.max / 1e6)
const cpu = diff(box.cpu(), c0)
// What else used the box's cores: other programs on this machine, plus the kernel work of the box itself
const otherPct = cores.length ? Math.max(0, ((coresBusySeconds(cores) - busy0 - sum(cpu)) / wall / cores.length) * 100) : null
for (const close of held) close()

const rows = Object.entries(lat).sort()
const worst = rows.map(([name, v]) => ({ name, p95: pct(v, 0.95), p99: pct(v, 0.99) }))
const reasons = []
for (const w of worst) {
  const limits = w.name === "know search" ? SEARCH_LIMITS : LIMITS
  if (w.p95 > limits.p95) reasons.push(`${w.name} p95 ${w.p95}ms`)
  else if (w.p99 > limits.p99) reasons.push(`${w.name} p99 ${w.p99}ms`)
}
if (lagP99 > 100) reasons.push(`LOAD GENERATOR SATURATED (event loop lag p99 ${lagP99}ms): the run is not valid`)
if (errors) reasons.push(`${errors} failed requests`)
if (sockets < VUS * 2 * 0.98) reasons.push(`only ${sockets}/${VUS * 2} sockets connected`)
if (live < VUS * 0.98) reasons.push(`only ${live}/${VUS} live-editing sessions`)

console.log(
  `MIX ${VUS} people, action every ${EVERY / 1000}s: ${wall.toFixed(0)}s, ${total} requests (${(total / wall).toFixed(1)}/s), errors=${errors}, ` +
    `sockets=${sockets}/${VUS * 2}, live=${live}/${VUS}`,
)
console.log(
  `  CPU of the box: ${((sum(cpu) / wall / CORES) * 100).toFixed(0)}% of ${CORES} core(s)  ` +
    Object.entries(cpu).map(([k, v]) => `${k}=${((v / wall) * 100).toFixed(0)}%`).join(" "),
)
console.log(`  load generator event-loop lag: p99=${lagP99}ms max=${lagMax}ms`)
if (otherPct !== null) console.log(`  other CPU use on the box's cores (kernel + other programs): ${otherPct.toFixed(0)}% of ${cores.length} core(s)`)
console.log(
  `  memory peak of the box: ${peak} MB  ` + Object.entries(peakMem).map(([k, v]) => `${k}=${v}`).join(" "),
)
for (const [k, v] of rows) {
  console.log(
    `  ${k.padEnd(18)} n=${String(v.length).padStart(5)} p50=${String(pct(v, 0.5)).padStart(5)}ms ` +
      `p95=${String(pct(v, 0.95)).padStart(5)}ms p99=${String(pct(v, 0.99)).padStart(5)}ms max=${String(pct(v, 1)).padStart(5)}ms`,
  )
}
if (storm.length) console.log(`  login storm (${storm.length} at once): p50=${pct(storm, 0.5)}ms max=${pct(storm, 1)}ms`)
console.log(`  verdict: ${reasons.length ? "DOES NOT COPE: " + reasons.join(", ") : "copes"}`)
console.log(
  "RESULT " +
    JSON.stringify({
      people: VUS, everySeconds: EVERY / 1000, rps: +(total / wall).toFixed(1), copes: reasons.length === 0, reasons,
      lagP99, boxCpuPct: +((sum(cpu) / wall / CORES) * 100).toFixed(0), otherPct: otherPct === null ? null : +otherPct.toFixed(0), memPeakMB: peak,
      worstP95: Math.max(...worst.filter((w) => w.name !== "know search").map((w) => w.p95)),
      worstP99: Math.max(...worst.filter((w) => w.name !== "know search").map((w) => w.p99)),
      searchP95: pct(lat["know search"] ?? [], 0.95),
    }),
)
process.exit(0)
