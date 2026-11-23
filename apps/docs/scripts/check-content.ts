// Runs the content rules over content/{en,es} before the static build (design.md §5).
// Exit 1 with one line per problem.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { listPages } from "../lib/content"
import { checkContent } from "../lib/content-checks"
import { SUPPORTED_LOCALES } from "../lib/locale-pick"
import { FORBIDDEN_VALUES } from "./forbidden-values"

const REPO = join(process.cwd(), "..", "..")

function keysOf(file: string, pattern: RegExp): Set<string> {
  const keys = new Set<string>()
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = pattern.exec(line)
    if (m) keys.add(m[1])
  }
  return keys
}

// Service names: the two-space keys directly under the top-level `services:` block.
function composeServices(file: string): Set<string> {
  const services = new Set<string>()
  let inServices = false
  for (const line of readFileSync(file, "utf8").split("\n")) {
    if (/^\S/.test(line)) inServices = line.startsWith("services:")
    const m = inServices ? /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line) : null
    if (m) services.add(m[1])
  }
  return services
}

// Secret-looking values of the local .env are forbidden too, when the file exists (not in CI).
function localSecrets(): string[] {
  const env = join(REPO, ".env")
  if (!existsSync(env)) return []
  return readFileSync(env, "utf8")
    .split("\n")
    .map((l) => /^([A-Z][A-Z0-9_]*)=(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m && /SECRET|PASSWORD|KEY|TOKEN/.test(m[1]))
    .map((m) => m[2].replace(/^["']|["']$/g, ""))
    .filter((v) => v.length >= 12)
}

// Release tags; the changelog rule needs them. A missing git or a clone without tags (shallow CI
// checkout, Docker build context) is not an error, but the rule then checks nothing: say so.
function gitTags(): string[] {
  let tags: string[]
  try {
    tags = execFileSync("git", ["tag", "-l"], { cwd: REPO, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
      .split("\n")
      .map((t) => t.trim())
      .filter(Boolean)
  } catch {
    console.log("content: notice: git is not available, the changelog was not checked against release tags")
    return []
  }
  if (!tags.length) console.log("content: notice: no git tags found, the changelog was not checked against release tags")
  return tags
}

const pages = SUPPORTED_LOCALES.flatMap((locale) => listPages(locale))
const errors = checkContent({
  locales: SUPPORTED_LOCALES,
  pages,
  forbidden: [...FORBIDDEN_VALUES, ...localSecrets()],
  envKeys: keysOf(join(REPO, ".env.example"), /^([A-Z][A-Z0-9_]*)=/),
  services: composeServices(join(REPO, "docker-compose.yml")),
  tags: gitTags(),
})

if (errors.length) {
  for (const e of errors) console.error(`content: ${e}`)
  console.error(`content: ${errors.length} problem(s)`)
  process.exit(1)
}
console.log(`content: ${pages.length} pages in ${SUPPORTED_LOCALES.join(", ")}, all rules hold`)
