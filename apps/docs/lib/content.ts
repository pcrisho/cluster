import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative, sep } from "node:path"
import matter from "gray-matter"

export const CONTENT_ROOT = join(process.cwd(), "content")

export type Frontmatter = {
  title: string
  description: string
  section: string
  order: number
  prerequisites?: string[]
}

export type DocPage = {
  locale: string
  /** "section/slug": the same key in every language (parity). */
  path: string
  frontmatter: Frontmatter
  body: string
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory()
      ? walk(full)
      : name.endsWith(".md")
        ? [full]
        : []
  })
}

function failFrontmatter(file: string, msg: string): never {
  throw new Error(`${file}: ${msg}`)
}

/** Throws with the file path when the frontmatter is not valid. */
export function parseFrontmatter(file: string, data: Record<string, unknown>): Frontmatter {
  if (typeof data.title !== "string" || !data.title.trim()) failFrontmatter(file, "title is required")
  const description = data.description
  if (typeof description !== "string") failFrontmatter(file, "description is required")
  if (description.length < 50 || description.length > 160)
    failFrontmatter(file, `description must be 50 to 160 characters (is ${description.length})`)
  if (typeof data.section !== "string" || !data.section) failFrontmatter(file, "section is required")
  if (!Number.isInteger(data.order)) failFrontmatter(file, "order must be an integer")
  return data as Frontmatter
}

export function listPages(locale: string): DocPage[] {
  const root = join(CONTENT_ROOT, locale)
  return walk(root).map((file) => {
    const raw = matter(readFileSync(file, "utf8"))
    const frontmatter = parseFrontmatter(file, raw.data)
    const path = relative(root, file).split(sep).join("/").replace(/\.md$/, "")
    return { locale, path, frontmatter, body: raw.content }
  })
}
