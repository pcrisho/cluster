// Shared helpers for the load scripts. Plain Node (>= 22), no dependencies. Linux only: it reads /proc and cgroups.
import { execFileSync } from "node:child_process"
import { createHmac } from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")

export const API = process.env.PERF_API_URL ?? "http://localhost:3011/api/v1"
export const COLLAB = process.env.PERF_COLLAB_URL ?? "ws://localhost:3012"
export const WEB = process.env.PERF_WEB_URL ?? "http://localhost:3013"
export const PASSWORD = process.env.PERF_PASSWORD ?? "Cluster-team-2026"
export const USER_COUNT = Number(process.env.PERF_USERS ?? 100)
export const ADMIN = {
  email: process.env.PERF_ADMIN_EMAIL ?? "admin@cluster.example",
  password: process.env.PERF_ADMIN_PASSWORD ?? "Cluster-demo-2026",
  // The superadmin signs in with 2FA; the dev seed gives it this secret (AGENTS.md).
  totpSecret: process.env.PERF_ADMIN_TOTP_SECRET ?? "CLUSTERDEMOADMINTOTPSECRETKEY234",
}
export const TMP = process.env.PERF_TMP ?? path.join(os.tmpdir(), "cluster-perf")
fs.mkdirSync(TMP, { recursive: true })

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export const pick = (a) => a[Math.floor(Math.random() * a.length)]

/** Percentile (0..1) of a list of numbers, rounded to whole units. */
export function pct(arr, p) {
  const a = [...arr].sort((x, y) => x - y)
  return a.length ? Math.round(a[Math.min(a.length - 1, Math.floor(a.length * p))]) : 0
}

/** The process listening on the port of a URL (the one whose CPU and memory we measure). */
export function pidOfPort(url) {
  const port = new URL(url.replace(/^ws/, "http")).port
  const out = execFileSync("ss", ["-ltnp"], { encoding: "utf8" })
  const line = out.split("\n").find((l) => l.includes(`:${port} `))
  const pid = line?.match(/pid=(\d+)/)?.[1]
  if (!pid) throw new Error(`Nothing is listening on port ${port} (is the stack up? see stack.sh)`)
  return Number(pid)
}

/** CPU time (utime + stime) of a process, in seconds. */
export function cpuSeconds(pid) {
  const f = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(") ")[1].split(" ")
  return (Number(f[11]) + Number(f[12])) / 100
}

export function rssMB(pid) {
  const m = fs.readFileSync(`/proc/${pid}/status`, "utf8").match(/VmRSS:\s+(\d+)/)
  return Math.round(Number(m[1]) / 1024)
}

const cgroups = {}
const cgroupOf = (container) =>
  (cgroups[container] ??= `/sys/fs/cgroup/system.slice/docker-${execFileSync("docker", ["inspect", "-f", "{{.Id}}", container], { encoding: "utf8" }).trim()}.scope`)

/** CPU time of a container in seconds, or null when it cannot be read (not Docker, cgroup v1...). */
export function containerSeconds(container) {
  try {
    return Number(fs.readFileSync(`${cgroupOf(container)}/cpu.stat`, "utf8").match(/usage_usec (\d+)/)[1]) / 1e6
  } catch {
    return null
  }
}

/** Memory of a container in MB, without the page cache (what `docker stats` shows), or null. */
export function containerMB(container) {
  try {
    const dir = cgroupOf(container)
    const current = Number(fs.readFileSync(`${dir}/memory.current`, "utf8"))
    const cache = Number(fs.readFileSync(`${dir}/memory.stat`, "utf8").match(/^inactive_file (\d+)/m)[1])
    return Math.round((current - cache) / 1048576)
  } catch {
    return null
  }
}

const PG_CONTAINER = process.env.PERF_PG_CONTAINER ?? "perf-postgres"
export const pgSeconds = () => containerSeconds(PG_CONTAINER)
export const fmtPg = (seconds, wall) => (seconds === null ? "n/a" : `${((seconds / wall) * 100).toFixed(0)}%`)

/**
 * Every service of the box (api, collab, web, Postgres, Redis, storage): CPU seconds and memory.
 * The sum of the CPU is what has to fit in the cores the server has; the memory, in its RAM.
 */
export function makeBox() {
  const pids = { api: pidOfPort(API), collab: pidOfPort(COLLAB) }
  try {
    pids.web = pidOfPort(WEB)
  } catch {
    // the web is optional
  }
  const containers = { pg: PG_CONTAINER, redis: "perf-redis", storage: "perf-storage" }
  return {
    cpu() {
      const out = {}
      for (const [k, pid] of Object.entries(pids)) out[k] = cpuSeconds(pid)
      for (const [k, c] of Object.entries(containers)) out[k] = containerSeconds(c) ?? 0
      return out
    },
    mem() {
      const out = {}
      for (const [k, pid] of Object.entries(pids)) out[k] = rssMB(pid)
      for (const [k, c] of Object.entries(containers)) out[k] = containerMB(c) ?? 0
      return out
    },
  }
}

/**
 * Jiffies of busy CPU time (user + system + irq + steal, so also the kernel work of the box) on the cores the box is
 * pinned to, from /proc/stat. The cores come from PERF_CPUSET or from the file stack.sh writes.
 */
export function boxCores() {
  const spec = process.env.PERF_CPUSET ?? (fs.existsSync(path.join(TMP, "cpuset")) ? fs.readFileSync(path.join(TMP, "cpuset"), "utf8").trim() : "")
  return spec ? spec.split(",").flatMap((r) => { const [a, b] = r.split("-").map(Number); return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i) }) : []
}
export function coresBusySeconds(cores) {
  let busy = 0
  for (const line of fs.readFileSync("/proc/stat", "utf8").split("\n")) {
    const m = line.match(/^cpu(\d+) (.*)/)
    if (m && cores.includes(Number(m[1]))) {
      const [user, nice, system, idle, iowait, irq, softirq, steal] = m[2].split(" ").map(Number)
      busy += user + nice + system + irq + softirq + steal
    }
  }
  return busy / 100
}

export const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0)
export const diff = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - b[k]]))

/** The current TOTP code (RFC 6238: SHA-1, 6 digits, 30 s) of a base32 secret. */
export function totp(secret, epoch = Date.now() / 1000) {
  const bits = [...secret].map((c) => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5, "0")).join("")
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(epoch / 30)))
  const mac = createHmac("sha1", key).update(counter).digest()
  const offset = mac[mac.length - 1] & 0x0f
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1e6).padStart(6, "0")
}

const post = (route, body) =>
  fetch(`${API}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })

/** Signs in; the superadmin's 2FA step is answered with the dev secret (a code is accepted once per 30 s). */
export async function login(email, password = PASSWORD) {
  const t = performance.now()
  let r = await post("/auth/login", { email, password })
  let j = await r.json()
  if (j.mfa === "VERIFY" && email === ADMIN.email) {
    r = await post("/auth/mfa/verify", { challengeId: j.challengeId, code: totp(ADMIN.totpSecret) })
    j = await r.json()
  }
  return { status: r.status, ms: performance.now() - t, token: j.accessToken ?? j.data?.accessToken, body: j }
}

export const perfEmail = (i) => `perf${i}@cluster.example`

/**
 * Access tokens of the synthetic users (perf1..perfN). Cached for a few minutes (they expire after 15);
 * signing in 10 at a time keeps this from being a login storm of its own (bcrypt is expensive, see BASELINE.md).
 */
export async function tokens({ fresh = false } = {}) {
  const file = path.join(TMP, "tokens.json")
  if (!fresh && fs.existsSync(file) && Date.now() - fs.statSync(file).mtimeMs < 8 * 60 * 1000) {
    return JSON.parse(fs.readFileSync(file, "utf8"))
  }
  const out = []
  for (let i = 1; i <= USER_COUNT; i += 10) {
    const batch = Array.from({ length: Math.min(10, USER_COUNT - i + 1) }, (_, k) => perfEmail(i + k))
    out.push(...(await Promise.all(batch.map(async (email) => ({ email, token: (await login(email)).token })))))
  }
  const ok = out.filter((t) => t.token)
  if (ok.length === 0) throw new Error("No synthetic user could sign in: did you run db.sh setup?")
  fs.writeFileSync(file, JSON.stringify(ok), { mode: 0o600 })
  return ok
}

export const bearer = (token) => ({ authorization: `Bearer ${token}` })

export async function getJson(p, token) {
  const r = await fetch(API + p, { headers: bearer(token) })
  if (!r.ok) throw new Error(`GET ${p} -> ${r.status}`)
  return r.json()
}

const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
)

/** Uploads a 1x1 PNG as the user and returns its storage key (an organization-wide upload, readable by everyone). */
export async function uploadTinyPng(token) {
  const fd = new FormData()
  fd.append("file", new Blob([PNG_1X1], { type: "image/png" }), "perf.png")
  const r = await fetch(`${API}/files/images`, { method: "POST", headers: bearer(token), body: fd })
  const j = await r.json()
  const key = j.key ?? j.data?.key
  if (!key) throw new Error(`Image upload failed (${r.status}): ${JSON.stringify(j)}`)
  return key
}
