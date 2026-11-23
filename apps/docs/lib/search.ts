export type ExcerptPart = {
  text: string
  hit: boolean
}

export type PagefindResultData = {
  url: string
  content?: string
  excerpt?: string
  meta?: {
    title?: string
    section?: string
  }
}

export type SearchResult = {
  url: string
  title: string
  section?: string
  excerpt: ExcerptPart[]
}

/** Lowercases and strips diacritics for locale-agnostic substring matching. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

/**
 * Returns true when every whitespace-separated token in `query` appears in the
 * item's title, section, or body content. Filters out Pagefind's loose fuzzy
 * matches so unknown words produce an empty state.
 */
export function matchesQuery(
  query: string,
  item: { title: string; section?: string; content: string }
): boolean {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return false
  const haystack = normalizeSearchText(`${item.title} ${item.section ?? ""} ${item.content}`)
  return tokens.every((token) => haystack.includes(token))
}

/**
 * Splits a Pagefind HTML excerpt into plain-text segments with `hit: true` for
 * `<mark>…</mark>` spans, avoiding `dangerouslySetInnerHTML`.
 */
export function parseExcerpt(html: string): ExcerptPart[] {
  const parts: ExcerptPart[] = []
  const pattern = /<mark>([\s\S]*?)<\/mark>/gi
  let last = 0
  for (const match of html.matchAll(pattern)) {
    const idx = match.index ?? 0
    if (idx > last) {
      const plain = stripTags(html.slice(last, idx))
      if (plain) parts.push({ text: plain, hit: false })
    }
    const marked = stripTags(match[1] ?? "")
    if (marked) parts.push({ text: marked, hit: true })
    last = idx + match[0].length
  }
  if (last < html.length) {
    const tail = stripTags(html.slice(last))
    if (tail) parts.push({ text: tail, hit: false })
  }
  return parts
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "")
}

/** Normalizes a Pagefind result URL so it always includes the active `/{locale}` prefix. */
export function resolveResultUrl(locale: string, rawUrl: string): string {
  const clean = rawUrl.replace(/index\.html$/, "")
  const normalized = clean.startsWith("/") ? clean : `/${clean}`
  if (normalized === `/${locale}/` || normalized.startsWith(`/${locale}/`)) {
    return normalized
  }
  return `/${locale}${normalized}`
}

/** Converts a Pagefind result payload into a `SearchResult` if it matches `query`. */
export function toSearchResult(query: string, data: PagefindResultData): SearchResult | null {
  const title = data.meta?.title?.trim() ?? ""
  const section = data.meta?.section?.trim() || undefined
  const content = data.content ?? ""
  if (!title || !matchesQuery(query, { title, section, content })) return null
  return {
    url: data.url,
    title,
    section,
    excerpt: parseExcerpt(data.excerpt ?? ""),
  }
}
