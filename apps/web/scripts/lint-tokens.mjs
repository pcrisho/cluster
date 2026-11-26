// Token guard (`pnpm lint:tokens`, also run by `pnpm lint`): per file counts of styling that
// bypasses the design tokens. A count may never rise against token-baseline.json.
//   --update   rewrite the baseline with the current counts (refused while any count rose,
//              except on an empty baseline, which it creates)
//   --summary  print the debt by area
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const rootIdx = args.indexOf("--root")
const customRoot =
  rootIdx !== -1 && args[rootIdx + 1] ? resolve(args[rootIdx + 1]) : null
const baselineIdx = args.indexOf("--baseline")
const customBaseline =
  baselineIdx !== -1 && args[baselineIdx + 1]
    ? resolve(args[baselineIdx + 1])
    : null

const DEFAULT_ROOT = fileURLToPath(new URL("..", import.meta.url))
const ROOT = customRoot ?? DEFAULT_ROOT
const BASELINE =
  customBaseline ??
  (customRoot ? null : join(ROOT, "scripts", "token-baseline.json"))
const DIRS = ["app", "components", "hooks", "lib"]
const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"

export const RULES = {
  // bg-emerald-500, dark:text-amber-400/80 …; the status tokens (text-neutral-text) have no shade.
  palette: new RegExp(`\\b[a-z]+(?:-[a-z]+)*-(?:${PALETTE})-\\d{2,3}\\b`, "g"),
  // text-[13px]: use the type scale (text-2xs, text-3xs, text-xs …).
  pixelText: /\btext-\[\d+(?:\.\d+)?px\]/g,
  // #4c33e1 in TSX: colours live in globals.css.
  hex: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g,
  // Loader icons placed by hand: use <Spinner />.
  loader:
    /\b(?:Loader2Icon|Loader2|LoaderCircleIcon|LoaderCircle|LoaderIcon)\b/g,
}

const EXEMPT = new Set([join("components", "ui", "spinner.tsx")])

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* files(path)
    else if (/\.tsx?$/.test(name) && !/\.spec\.ts$/.test(name)) yield path
  }
}

export function count(source, tsx = true) {
  const counts = {}
  for (const [rule, pattern] of Object.entries(RULES)) {
    if (rule === "hex" && !tsx) continue
    const n = source.match(pattern)?.length ?? 0
    if (n) counts[rule] = n
  }
  return counts
}

function measure() {
  const result = {}
  for (const dir of DIRS) {
    const dirPath = join(ROOT, dir)
    if (!existsSync(dirPath)) continue
    for (const path of files(dirPath)) {
      const file = relative(ROOT, path).split(sep).join("/")
      if (EXEMPT.has(relative(ROOT, path))) continue
      const counts = count(readFileSync(path, "utf8"), path.endsWith(".tsx"))
      if (Object.keys(counts).length) result[file] = counts
    }
  }
  return result
}

function rises(current, baseline) {
  const out = []
  for (const [file, counts] of Object.entries(current))
    for (const [rule, n] of Object.entries(counts)) {
      const allowed = baseline[file]?.[rule] ?? 0
      if (n > allowed) out.push(`${file}: ${rule} ${allowed} → ${n}`)
    }
  return out
}

function summary(current) {
  const areas = {}
  for (const [file, counts] of Object.entries(current)) {
    const area = file.split("/").slice(0, 2).join("/")
    areas[area] ??= {}
    for (const [rule, n] of Object.entries(counts))
      areas[area][rule] = (areas[area][rule] ?? 0) + n
  }
  console.table(areas)
}

const current = measure()
const baseline =
  BASELINE && existsSync(BASELINE)
    ? JSON.parse(readFileSync(BASELINE, "utf8"))
    : {}
const creating =
  BASELINE !== null &&
  Object.keys(baseline).length === 0 &&
  args.includes("--update")
const risen = creating ? [] : rises(current, baseline)

if (args.includes("--summary")) summary(current)

if (risen.length) {
  console.error(
    "Token debt rose (use the design tokens, StatusBadge or Spinner instead):\n  " +
      risen.join("\n  ")
  )
  process.exit(1)
}

if (args.includes("--update")) {
  if (!BASELINE) {
    console.error(
      "Cannot update baseline: no baseline file configured for this root."
    )
    process.exit(1)
  }
  const sorted = Object.fromEntries(Object.entries(current).sort())
  writeFileSync(BASELINE, JSON.stringify(sorted, null, 2) + "\n")
  console.log("token-baseline.json updated")
} else {
  const total = (set) =>
    Object.values(set).reduce(
      (sum, counts) => sum + Object.values(counts).reduce((a, b) => a + b, 0),
      0
    )
  const lowered = total(baseline) - total(current)
  console.log(
    `Token guard: no new debt (${total(current)} left${lowered > 0 ? `; ${lowered} fewer than the baseline, run with --update` : ""})`
  )
}
