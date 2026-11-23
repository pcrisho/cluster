// Per-endpoint saturation: a fixed number of workers hit one endpoint as fast as they can, rotating users.
// Reports throughput, latency and the CPU each request costs the API and Postgres (the number to size with).
//   node endpoints.mjs [workers=16] [seconds=8] [name-filter,name-filter]
import {
  API, bearer, cpuSeconds, fmtPg, getJson, pct, pgSeconds, pidOfPort, rssMB, tokens, uploadTinyPng,
} from "./lib.mjs"

const WORKERS = Number(process.argv[2] ?? 16)
const DURATION = Number(process.argv[3] ?? 8) * 1000
const only = process.argv[4]?.split(",")
const pid = pidOfPort(API)
const users = await tokens()

const first = users[0].token
const spaces = (await getJson("/know/spaces", first)).data
const big = spaces.find((s) => s.name === "Space 1") ?? spaces[0]
const pageId = (await getJson(`/know/spaces/${big.id}/pages`, first)).data[5].id
const fileKey = await uploadTinyPng(first)

const endpoints = {
  "notif unread-count": "/notifications/unread-count",
  "auth me": "/auth/me",
  "know spaces list": "/know/spaces",
  "know page tree (1000 pages)": `/know/spaces/${big.id}/pages`,
  "know page get": `/know/pages/${pageId}`,
  "know search (no match)": "/know/search?q=zzzqnomatch",
  "know search (common word)": "/know/search?q=lorem",
  "know search (selective)": "/know/search?q=202cb9",
  "connect feed (20)": "/connect/feed",
  "connect directory": "/connect/directory",
  "grow learning": "/grow/learning",
  "file get (png)": `/files/${fileKey}`,
}

for (const [name, path] of Object.entries(endpoints)) {
  if (only && !only.some((x) => name.includes(x))) continue
  const lat = []
  let n = 0, errors = 0, bytes = 0, stop = false
  const c0 = cpuSeconds(pid), p0 = pgSeconds(), t0 = performance.now()
  setTimeout(() => (stop = true), DURATION)
  await Promise.all(
    Array.from({ length: WORKERS }, async (_, w) => {
      for (let i = w; !stop; i++) {
        const s = performance.now()
        const r = await fetch(API + path, { headers: bearer(users[i % users.length].token) })
        bytes = (await r.arrayBuffer()).byteLength
        lat.push(performance.now() - s)
        n++
        if (r.status >= 400) errors++
      }
    }),
  )
  const wall = (performance.now() - t0) / 1000
  const cpu = cpuSeconds(pid) - c0
  const pg = pgSeconds() === null ? null : pgSeconds() - p0
  console.log(
    `${name.padEnd(30)} rps=${(n / wall).toFixed(0).padStart(4)} p50=${String(pct(lat, 0.5)).padStart(4)}ms ` +
      `p95=${String(pct(lat, 0.95)).padStart(4)}ms p99=${String(pct(lat, 0.99)).padStart(4)}ms ` +
      `api=${((cpu / n) * 1000).toFixed(1)}ms pg=${pg === null ? "n/a" : ((pg / n) * 1000).toFixed(1)}ms per req ` +
      `resp=${(bytes / 1024).toFixed(1)}KB errors=${errors} api-cpu=${((cpu / wall) * 100).toFixed(0)}% pg-cpu=${fmtPg(pg, wall)} rss=${rssMB(pid)}MB`,
  )
}
