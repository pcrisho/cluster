import fs from "node:fs"
import path from "node:path"

export type LinkError = {
  source: string
  target: string
  kind: "link" | "anchor" | "image"
  reason: string
}

const SKIP_DIRS = new Set(["_next", "pagefind"])

export function collectHtmlFiles(rootDir: string): string[] {
  const results: string[] = []
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
      } else if (entry.isFile() && entry.name.endsWith(".html")) {
        results.push(path.join(dir, entry.name))
      }
    }
  }
  if (fs.existsSync(rootDir)) walk(rootDir)
  return results.sort()
}

export function extractIds(html: string): Set<string> {
  const ids = new Set<string>()
  const pattern = /\sid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi
  for (const match of html.matchAll(pattern)) {
    const id = match[1] ?? match[2]
    if (id) ids.add(id)
  }
  return ids
}

export function extractRefs(html: string): { hrefs: string[]; srcs: string[] } {
  const hrefs: string[] = []
  const srcs: string[] = []
  const anchorTag = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  for (const match of html.matchAll(anchorTag)) {
    const val = (match[1] ?? match[2] ?? "").trim()
    if (val) hrefs.push(val)
  }
  const imgTag = /<img\b[^>]*\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/gi
  for (const match of html.matchAll(imgTag)) {
    const val = (match[1] ?? match[2] ?? "").trim()
    if (val) srcs.push(val)
  }
  return { hrefs, srcs }
}

function isExternalRef(ref: string): boolean {
  return /^(https?:|mailto:|tel:|javascript:|data:|blob:)/i.test(ref)
}

function resolveTargetFile(outDir: string, fromFile: string, rawPath: string): string | null {
  const cleanPath = rawPath.split("?")[0]
  if (!cleanPath) return fromFile
  const baseDir = cleanPath.startsWith("/") ? outDir : path.dirname(fromFile)
  const rel = cleanPath.startsWith("/") ? cleanPath.slice(1) : cleanPath
  const candidate = path.resolve(baseDir, rel)
  if (!candidate.startsWith(path.resolve(outDir))) return null

  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
    return candidate
  }
  const indexCandidate = path.join(candidate, "index.html")
  if (fs.existsSync(indexCandidate) && fs.statSync(indexCandidate).isFile()) {
    return indexCandidate
  }
  return null
}

/**
 * Verifies all internal `<a href>` links, `#anchor` fragments, and `<img src>`
 * assets across the static export in `outDir`.
 */
export function checkOutputLinks(outDir: string): LinkError[] {
  const absOut = path.resolve(outDir)
  const htmlFiles = collectHtmlFiles(absOut)
  const idCache = new Map<string, Set<string>>()
  const errors: LinkError[] = []

  const getIds = (file: string): Set<string> => {
    let ids = idCache.get(file)
    if (!ids) {
      ids = extractIds(fs.readFileSync(file, "utf8"))
      idCache.set(file, ids)
    }
    return ids
  }

  for (const file of htmlFiles) {
    const relSource = path.relative(absOut, file)
    const html = fs.readFileSync(file, "utf8")
    const { hrefs, srcs } = extractRefs(html)

    for (const href of hrefs) {
      if (isExternalRef(href)) continue
      const hashIdx = href.indexOf("#")
      const pathPart = hashIdx === -1 ? href : href.slice(0, hashIdx)
      const fragment = hashIdx === -1 ? "" : href.slice(hashIdx + 1)

      const targetFile = resolveTargetFile(absOut, file, pathPart)
      if (!targetFile) {
        errors.push({
          source: relSource,
          target: href,
          kind: "link",
          reason: "target page or file does not exist",
        })
        continue
      }

      if (fragment) {
        const decoded = decodeURIComponent(fragment)
        if (!getIds(targetFile).has(decoded)) {
          errors.push({
            source: relSource,
            target: href,
            kind: "anchor",
            reason: `missing anchor #${decoded}`,
          })
        }
      }
    }

    for (const src of srcs) {
      if (isExternalRef(src)) continue
      const targetFile = resolveTargetFile(absOut, file, src)
      if (!targetFile) {
        errors.push({
          source: relSource,
          target: src,
          kind: "image",
          reason: "image file does not exist",
        })
      }
    }
  }

  return errors
}
