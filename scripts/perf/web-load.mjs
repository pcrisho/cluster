// The web server (Next standalone): server-rendered pages and static files.
//   node web-load.mjs [path ...]        default: /login
import { WEB, cpuSeconds, pct, pidOfPort, rssMB } from "./lib.mjs"

const paths = process.argv.length > 2 ? process.argv.slice(2) : ["/login"]
const pid = pidOfPort(WEB)
for (const p of paths) {
  const lat = []
  let n = 0, bytes = 0, status = 0, stop = false
  const c0 = cpuSeconds(pid), t0 = performance.now()
  setTimeout(() => (stop = true), 6000)
  await Promise.all(
    Array.from({ length: 16 }, async () => {
      while (!stop) {
        const s = performance.now()
        const r = await fetch(WEB + p)
        bytes = (await r.arrayBuffer()).byteLength
        status = r.status
        lat.push(performance.now() - s)
        n++
      }
    }),
  )
  const wall = (performance.now() - t0) / 1000
  console.log(
    `${p.slice(0, 50).padEnd(50)} status=${status} rps=${(n / wall).toFixed(0)} p50=${pct(lat, 0.5)}ms p95=${pct(lat, 0.95)}ms ` +
      `cpu/req=${(((cpuSeconds(pid) - c0) / n) * 1000).toFixed(1)}ms size=${(bytes / 1024).toFixed(0)}KB rss=${rssMB(pid)}MB`,
  )
}
