// How many people fit: runs mix.mjs with more and more people until the box stops coping, at two intensities.
//   taskset -c 8-11 node capacity.mjs [intensities=15,5] [steps=25,50,75,100,150,200,300] [seconds=60]
// An intensity is the average seconds between a person's actions (15 = ordinary use, 5 = busy).
// The result is the largest step that copes (see the limits at the top of mix.mjs); each step is a separate run.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { fileURLToPath } from "node:url"
import { sleep } from "./lib.mjs"

const run = promisify(execFile)
const intensities = (process.argv[2] ?? "15,5").split(",").map(Number)
const steps = (process.argv[3] ?? "25,50,75,100,150,200,300").split(",").map(Number)
const seconds = Number(process.argv[4] ?? 60)
const mix = fileURLToPath(new URL("./mix.mjs", import.meta.url))

const summary = []
for (const every of intensities) {
  let best = 0
  let fails = 0
  for (const people of steps) {
    let out
    try {
      out = (await run("node", [mix, String(every), String(seconds), String(people)], { maxBuffer: 10 * 1024 * 1024, env: process.env })).stdout
    } catch (e) {
      out = e.stdout ?? ""
      console.log(`step ${people} crashed: ${e.message.split("\n")[0]}`)
    }
    const line = out.split("\n").find((l) => l.startsWith("RESULT "))
    const result = line ? JSON.parse(line.slice(7)) : { copes: false, reasons: ["the run failed"], people }
    console.log(out.split("\n").filter((l) => !l.startsWith("RESULT ")).join("\n"))
    summary.push({ every, ...result })
    if (result.copes) {
      best = people
      fails = 0
    } else if (++fails >= 2) break
    await sleep(8000) // let the box settle (GC, connections closing)
  }
  console.log(`>>> action every ${every}s: up to ${best} people cope\n`)
}
console.log("SUMMARY")
console.table(summary.map(({ every, people, rps, copes, boxCpuPct, otherPct, memPeakMB, worstP95, worstP99, searchP95 }) => ({ every, people, rps, copes, boxCpuPct, otherPct, memPeakMB, worstP95, worstP99, searchP95 })))
