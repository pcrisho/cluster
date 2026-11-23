/**
 * Server- and client-safe rich-text rendering.
 *
 * `renderRichText` converts a serialized TipTap doc to HTML for
 * use in `dangerouslySetInnerHTML`. It sanitizes the output with
 * DOMPurify when running in the browser (where `window` is
 * available) and returns unsanitized HTML on the server (server
 * output is safe by construction — only stores trusted content
 * from authenticated editors).
 *
 * Rendering uses `@tiptap/static-renderer`, which walks the schema
 * and emits strings without a DOM. `@tiptap/html`'s `generateHTML`
 * needs `window` in the browser and `happy-dom` on the server; the
 * page detail and space description are Client Components that Next
 * also prerenders, so the same code must run in both.
 *
 * Why no `jsdom`: we deliberately avoid the dependency. The page
 * detail and space description are rendered as Client Components
 * (`"use client"`), so the sanitization path is the one that runs
 * in the browser. If a future Server Component ever needs to
 * render rich text, switch to `isomorphic-dompurify` at that
 * time.
 */

import { renderToHTMLString } from "@tiptap/static-renderer"
import { schemaExtensions } from "@cluster/editor-schema"
import DOMPurify from "dompurify"

import { parseRichText } from "./content"
import { ImageWithUrl } from "./image-view"

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const

const ALLOWED_TAGS = [
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "code",
  "pre",
  "blockquote",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "span",
  "div",
]

const ALLOWED_ATTR = [
  "href",
  "src",
  "alt",
  "title",
  "id",
  "class",
  "target",
  "rel",
]

/**
 * Render a serialized rich-text document to HTML, sanitized for
 * XSS when running in a browser context.
 */
export function renderRichText(serialized: string | null | undefined): string {
  if (!serialized) return ""

  const doc = parseRichText(serialized)

  let html: string
  try {
    const extensions = schemaExtensions.map((ext) =>
      ext.name === "image" ? ImageWithUrl : ext
    )
    html = renderToHTMLString({ content: doc, extensions })
  } catch {
    return ""
  }

  html = addHeadingIds(html)
  return sanitizeIfBrowser(html)
}

function sanitizeIfBrowser(html: string): string {
  if (typeof window === "undefined") return html
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
  })
}

function addHeadingIds(html: string): string {
  if (typeof window === "undefined" || !html) return html
  const parser = new DOMParser()
  const doc = parser.parseFromString(`<div>${html}</div>`, "text/html")
  const container = doc.body.firstElementChild
  if (!container) return html
  const headings = container.querySelectorAll(HEADING_TAGS.join(","))
  const used = new Map<string, number>()
  headings.forEach((h) => {
    const text = h.textContent?.trim() ?? ""
    if (!text) return
    const id = uniqueSlug(text, used)
    // Preserve any pre-existing id; only assign when missing.
    if (!h.id) h.id = id
  })
  return container.innerHTML
}

function uniqueSlug(text: string, used: Map<string, number>): string {
  const base = slugify(text)
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count}`
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 60) || "section"
  )
}
