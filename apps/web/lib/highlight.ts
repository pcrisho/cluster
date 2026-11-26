/**
 * Escapes a string for safe insertion into a regex.
 */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Splits `text` into segments around case-insensitive matches of `query`.
 * Returns an array of `{ text, match }` pairs suitable for rendering with <mark>.
 *
 * Returns a single segment with the full text when `query` is empty or
 * produces no matches.
 */
export interface HighlightSegment {
  text: string
  match: boolean
}

export function highlight(text: string, query: string): HighlightSegment[] {
  if (!query || query.trim().length === 0) return [{ text, match: false }]
  const trimmed = query.trim()
  const regex = new RegExp(`(${escapeRegExp(trimmed)})`, "gi")
  const parts = text.split(regex)
  return parts
    .filter((p) => p.length > 0)
    .map((p) => ({ text: p, match: p.toLowerCase() === trimmed.toLowerCase() }))
}
