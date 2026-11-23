import path from "node:path"
import { checkOutputLinks } from "../lib/link-check"

const outDir = path.resolve(process.cwd(), "out")
const errors = checkOutputLinks(outDir)

if (errors.length > 0) {
  for (const err of errors) {
    console.error(`${err.source} -> ${err.target} (${err.kind}: ${err.reason})`)
  }
  console.error(`link check failed: ${errors.length} broken reference(s)`)
  process.exit(1)
}

console.log(`link check: all internal links, anchors and images in ${outDir} resolve`)
