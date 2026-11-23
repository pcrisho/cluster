import type { DocPage } from "./content"

// Rules of docs/specs/docs-site/public-docs/design.md §5. Pure: the script reads the files,
// these functions decide. Each returns messages; an empty list means the rule holds.

export type ContentInput = {
  locales: readonly string[]
  pages: readonly DocPage[]
  /** Values that must never appear in published content (seed credentials, secrets). */
  forbidden: readonly string[]
  /** Keys of .env.example. */
  envKeys: ReadonlySet<string>
  /** Service names of docker-compose.yml. */
  services: ReadonlySet<string>
  /** Release tags from `git tag -l` (optional). */
  tags?: readonly string[]
}

const SELF_HOST = "self-host"

export function checkParity({ locales, pages }: ContentInput): string[] {
  const byLocale = new Map(locales.map((l) => [l, new Set<string>()]))
  for (const p of pages) byLocale.get(p.locale)?.add(p.path)
  const all = new Set(pages.map((p) => p.path))
  const errors: string[] = []
  for (const path of all) {
    for (const locale of locales) {
      if (!byLocale.get(locale)?.has(path)) {
        errors.push(`${path}: missing in ${locale}`)
      }
    }
  }
  return errors
}

export function checkOrder({ pages }: ContentInput): string[] {
  const seen = new Map<string, string>()
  const errors: string[] = []
  for (const p of pages) {
    const key = `${p.locale}/${p.frontmatter.section}/${p.frontmatter.order}`
    const other = seen.get(key)
    if (other) errors.push(`${p.path} (${p.locale}): order ${p.frontmatter.order} already used by ${other}`)
    else seen.set(key, p.path)
  }
  return errors
}

export function checkForbidden({ pages, forbidden }: ContentInput): string[] {
  const errors: string[] = []
  const linkToDocs = /\]\((?:[^)\s]*\/)?docs\/|\]\(\/docs\/specs/
  const issueRef = /(?<![\w&/])#\d{1,5}\b/
  for (const p of pages) {
    const where = `${p.locale}/${p.path}`
    const text = `${p.frontmatter.title}\n${p.frontmatter.description}\n${p.body}`
    if (linkToDocs.test(p.body)) errors.push(`${where}: links into the internal docs/ folder`)
    if (issueRef.test(text)) errors.push(`${where}: refers to an internal issue number`)
    for (const value of forbidden) {
      if (value && text.includes(value)) errors.push(`${where}: contains a forbidden value`)
    }
  }
  return errors
}

export function checkImages({ pages }: ContentInput): string[] {
  const errors: string[] = []
  const image = /!\[([^\]]*)\]\(([^)\s]+)/g
  for (const p of pages) {
    for (const m of p.body.matchAll(image)) {
      const [, alt, src] = m
      if (!alt.trim()) errors.push(`${p.locale}/${p.path}: image ${src} has no alt text`)
      if (!src.startsWith("/") && !src.startsWith("https://")) {
        errors.push(`${p.locale}/${p.path}: image ${src} must be a root path or https`)
      }
    }
  }
  return errors
}

// Self-host pages may name only variables that exist in .env.example, and only services that
// exist in docker-compose.yml. Variables are written in backticks and contain an underscore.
export function checkSelfHost({ pages, envKeys, services }: ContentInput): string[] {
  const errors: string[] = []
  const envToken = /`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g
  const composeCmd = /docker compose (?:-T |--profile \S+ )*(?:exec|logs|restart|ps|up|build|stop)(?: -[^\s`]+)*\s+([a-z][a-z0-9-]*)/g
  for (const p of pages) {
    if (p.frontmatter.section !== SELF_HOST) continue
    const where = `${p.locale}/${p.path}`
    for (const m of p.body.matchAll(envToken)) {
      if (!envKeys.has(m[1])) errors.push(`${where}: documents ${m[1]}, which is not in .env.example`)
    }
    for (const m of p.body.matchAll(composeCmd)) {
      if (!services.has(m[1])) errors.push(`${where}: names service "${m[1]}", which is not in docker-compose.yml`)
    }
  }
  return errors
}

export function checkChangelog({ locales, pages, tags = [] }: ContentInput): string[] {
  const errors: string[] = []
  const byLocale = new Map(locales.map((l) => [l, new Set<string>()]))
  for (const p of pages) {
    if (p.frontmatter.section === "changelog") {
      byLocale.get(p.locale)?.add(p.path)
    }
  }
  for (const tag of tags) {
    const slug = tag.trim().replace(/^v/i, "").replace(/\./g, "-").toLowerCase()
    if (!slug) continue
    const expected = `changelog/${slug}`
    for (const locale of locales) {
      if (!byLocale.get(locale)?.has(expected)) {
        errors.push(`${expected} (${locale}): missing changelog entry for release tag ${tag}`)
      }
    }
  }
  return errors
}

export function checkContent(input: ContentInput): string[] {
  return [
    ...checkParity(input),
    ...checkOrder(input),
    ...checkForbidden(input),
    ...checkImages(input),
    ...checkSelfHost(input),
    ...checkChangelog(input),
  ]
}
