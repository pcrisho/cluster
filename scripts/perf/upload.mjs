// Upload memory: N users upload an image of MB megabytes at the same time. The API keeps each file in
// memory while it checks and stores it, so this is how to see (and, with a 512M limit, trigger) an OOM.
// It stores N files of MB in the bucket: run cleanup.mjs afterwards.
//   node upload.mjs [concurrent=5] [mb=15]        (the image limit is 20 MB)
import { API, bearer, pidOfPort, rssMB, sleep, tokens } from "./lib.mjs"

const N = Number(process.argv[2] ?? 5)
const MB = Number(process.argv[3] ?? 15)
const pid = pidOfPort(API)
const users = await tokens()
const png = Buffer.concat([
  Buffer.from(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000001e221bc330000000049454e44ae426082",
    "hex",
  ),
  Buffer.alloc(MB * 1024 * 1024),
])

let peak = rssMB(pid)
let running = true
void (async () => {
  while (running) {
    try {
      peak = Math.max(peak, rssMB(pid))
    } catch {
      // the process died: the statuses below say so
    }
    await sleep(50)
  }
})()
const t0 = performance.now()
const statuses = await Promise.all(
  Array.from({ length: N }, async (_, i) => {
    const fd = new FormData()
    fd.append("file", new Blob([png], { type: "image/png" }), "big.png")
    try {
      const r = await fetch(`${API}/files/images`, { method: "POST", headers: bearer(users[i % users.length].token), body: fd })
      await r.text()
      return r.status
    } catch (e) {
      return `ERR ${e.cause?.code ?? e.message}`
    }
  }),
)
running = false
const count = statuses.reduce((a, s) => ((a[s] = (a[s] ?? 0) + 1), a), {})
console.log(`${N} concurrent uploads of ${MB} MB: ${JSON.stringify(count)} in ${((performance.now() - t0) / 1000).toFixed(1)}s, peak RSS ${peak} MB`)
