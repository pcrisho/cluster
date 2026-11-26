// Sign-in cost: N users sign in at the same instant (the go-live morning, a Monday after refresh tokens expire).
//   node login.mjs [count=100]
import { API, cpuSeconds, login, perfEmail, pct, pidOfPort, rssMB } from "./lib.mjs"

const count = Number(process.argv[2] ?? 100)
const pid = pidOfPort(API)
const c0 = cpuSeconds(pid)
const t0 = performance.now()
const res = await Promise.all(Array.from({ length: count }, (_, i) => login(perfEmail(i + 1))))
const wall = (performance.now() - t0) / 1000
const cpu = cpuSeconds(pid) - c0
const ms = res.map((r) => r.ms)
console.log(
  `logins=${count} ok=${res.filter((r) => r.status < 300).length} wall=${wall.toFixed(1)}s api-cpu=${cpu.toFixed(1)}s ` +
    `(${((cpu / count) * 1000).toFixed(0)}ms each) p50=${pct(ms, 0.5)}ms p95=${pct(ms, 0.95)}ms max=${pct(ms, 1)}ms rss=${rssMB(pid)}MB`,
)
