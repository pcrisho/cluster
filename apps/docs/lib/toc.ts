import { headingSlug } from "./slug"

export type TocItem = { depth: 2 | 3; text: string; id: string }

// The table of contents reads the same headings the page renders, so the ids match
// (headingSlug is shared). Code fences are skipped; inline markup is reduced to its text.
export function extractToc(body: string): TocItem[] {
  const items: TocItem[] = []
  const seen = new Map<string, number>()
  let inFence = false
  for (const line of body.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line)
    if (!m) continue
    const text = m[2]
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim()
    items.push({ depth: m[1].length as 2 | 3, text, id: headingSlug(text, seen) })
  }
  return items
}
