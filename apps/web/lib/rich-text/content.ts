/**
 * Pure helpers for working with rich-text documents.
 *
 * Public API (used by KNOW and any future module that stores
 * TipTap-shaped rich text):
 *   - `emptyRichText()`        — fresh empty doc
 *   - `parseRichText(raw)`     — string → RichTextDoc (defensive)
 *   - `serializeRichText(doc)` — RichTextDoc (or unknown) → string
 *   - `extractPlainTextFromContent(doc, max?)` — doc → plain text
 *
 * The functions are intentionally side-effect-free and have no
 * imports of React, TipTap, or any module-specific code. They are
 * safe to import in both client and server components, and in
 * worker contexts.
 */

import type { RichTextDoc, RichTextNode } from "./types"

const MAX_PLAIN_TEXT_LENGTH = 280

/**
 * Returns a fresh empty rich-text document.
 */
export function emptyRichText(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] }
}

/**
 * Parse a serialized rich-text document string back to a
 * `RichTextDoc`. Defensive against every form of malformed input:
 *   - empty / null / undefined → empty doc
 *   - non-JSON string → empty doc
 *   - JSON missing `type: "doc"` → empty doc
 *   - JSON with `content` that is not an array → empty doc with one
 *     empty paragraph
 */
export function parseRichText(raw: string | null | undefined): RichTextDoc {
  if (!raw) return emptyDoc()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return emptyDoc()
  }
  if (!isObject(parsed)) return emptyDoc()
  if (parsed.type !== "doc") return emptyDoc()
  const content = (parsed as { content?: unknown }).content
  if (content === undefined) {
    return { type: "doc", content: [{ type: "paragraph" }] }
  }
  if (!Array.isArray(content)) {
    return { type: "doc", content: [{ type: "paragraph" }] }
  }
  return { type: "doc", content: content as RichTextNode[] }
}

/**
 * Serialize a rich-text document to a string for storage. Accepts
 * a known `RichTextDoc` or any unknown (round-trip). Returns the
 * empty string if the value cannot be stringified.
 */
export function serializeRichText(content: unknown | null | undefined): string {
  if (!content) return ""
  if (typeof content === "string") return content
  try {
    return JSON.stringify(content)
  } catch {
    return ""
  }
}

/**
 * Extract a plain-text representation of a rich-text document,
 * suitable for previews, snippets, and search highlights.
 *
 *   - Returns `null` when the document is empty or invalid.
 *   - Preserves paragraph breaks by joining top-level paragraphs
 *     with `\n\n` (vs. the previous implementation that joined
 *     every text node with a single space, which destroyed
 *     structure).
 *   - Truncates to `maxLength` characters with an ellipsis.
 */
export function extractPlainTextFromContent(
  content: unknown,
  maxLength: number = MAX_PLAIN_TEXT_LENGTH
): string | null {
  if (!content || typeof content !== "object") return null

  const doc = content as RichTextDoc
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return null

  const paragraphs: string[] = []
  for (const top of doc.content) {
    const text: string[] = []
    collectText(top, text)
    const joined = text.join("").replace(/\s+/g, " ").trim()
    if (joined) paragraphs.push(joined)
  }

  const full = paragraphs.join("\n\n").trim()
  if (!full) return null

  if (full.length > maxLength) {
    return `${full.slice(0, maxLength).trimEnd()}…`
  }
  return full
}

function collectText(node: RichTextNode, out: string[]) {
  if (typeof node.text === "string") {
    out.push(node.text)
  }
  if (Array.isArray(node.content)) {
    for (const child of node.content) collectText(child, out)
  }
}

function emptyDoc(): RichTextDoc {
  return { type: "doc", content: [{ type: "paragraph" }] }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null
}
