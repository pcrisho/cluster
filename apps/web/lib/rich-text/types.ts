/**
 * Rich-text document types — TipTap-compatible shape, but owned
 * by our `lib/rich-text` module so consumers (KNOW, GROW, future
 * modules) can depend on a stable contract that does not leak
 * TipTap into their public API.
 *
 * The shape matches TipTap's `JSONContent` for the fields we use
 * today (text nodes, paragraphs, headings, lists, blockquotes,
 * code blocks, task lists, images, marks). Nodes with custom
 * attrs (e.g. mention, image width) extend `attrs` via Record.
 */

export interface RichTextMark {
  type: string
  attrs?: Record<string, unknown>
}

export interface RichTextNode {
  type: string
  text?: string
  attrs?: Record<string, unknown>
  content?: RichTextNode[]
  marks?: RichTextMark[]
}

export interface RichTextDoc {
  type: "doc"
  content?: RichTextNode[]
}
