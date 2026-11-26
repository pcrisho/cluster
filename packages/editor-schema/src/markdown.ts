import MarkdownIt from "markdown-it"

import { EMPTY_DOC } from "./empty-doc"
import { isAllowedImageSrc, isAllowedLinkHref } from "./validate"

type Token = ReturnType<MarkdownIt["parse"]>[number]

interface Mark {
  type: string
  attrs?: Record<string, unknown>
}

interface Node {
  type?: string
  text?: string
  attrs?: Record<string, unknown>
  marks?: Mark[]
  content?: Node[]
}

/** The source cannot be imported at all (it contains HTML). */
export class MarkdownImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MarkdownImportError"
  }
}

export interface MarkdownImport {
  /** Text of a leading `# Heading`, which is taken out of the body; null when the source does not start with one. */
  title: string | null
  doc: Node
  /** Kinds of content the editor does not accept and the import left out. */
  dropped: string[]
}

export interface MarkdownExport {
  markdown: string
  /** Kinds of content Markdown cannot carry; they are left out or reduced to text. */
  lost: string[]
}

const LINK_ATTRS = {
  target: "_blank",
  rel: "noopener noreferrer nofollow",
  class: null,
}

let parser: MarkdownIt | undefined
// Built on first use so importing the package costs nothing for the editors.
function getParser(): MarkdownIt {
  parser ??= new MarkdownIt("commonmark", { html: true }).enable(
    "strikethrough"
  )
  return parser
}

// ── Markdown → document ────────────────────────────────────────────

interface Ctx {
  tokens: Token[]
  i: number
  dropped: Set<string>
}

/**
 * Converts Markdown to an editor document. HTML is refused; links that are not
 * http, https or mailto and images that are not https are dropped (and reported).
 * Callers still run `assertValidDoc` on the result.
 */
export function markdownToDoc(source: string): MarkdownImport {
  const ctx: Ctx = {
    tokens: getParser().parse(source, {}),
    i: 0,
    dropped: new Set(),
  }
  const content = blocks(ctx)

  let title: string | null = null
  const first = content[0]
  if (first?.type === "heading" && first.attrs?.level === 1) {
    title = plainText(first).trim() || null
    if (title) content.shift()
  }

  const doc =
    content.length === 0
      ? (JSON.parse(JSON.stringify(EMPTY_DOC)) as Node)
      : { type: "doc", content }
  return { title, doc, dropped: [...ctx.dropped] }
}

function blocks(ctx: Ctx, closeType?: string): Node[] {
  const out: Node[] = []
  while (ctx.i < ctx.tokens.length) {
    const t = ctx.tokens[ctx.i++]
    if (t.type === closeType) return out
    switch (t.type) {
      case "heading_open": {
        const level = Number(t.tag.slice(1))
        const inline = ctx.tokens[ctx.i]
        ctx.i += 2
        out.push(
          ...inlineBlocks(ctx, inline, () => ({
            type: "heading",
            attrs: { level },
          }))
        )
        break
      }
      case "paragraph_open": {
        const inline = ctx.tokens[ctx.i]
        ctx.i += 2
        out.push(...inlineBlocks(ctx, inline, () => ({ type: "paragraph" })))
        break
      }
      case "bullet_list_open":
        out.push(list(ctx, "bullet_list_close", "bulletList", {}))
        break
      case "ordered_list_open":
        out.push(
          list(ctx, "ordered_list_close", "orderedList", {
            start: Number(t.attrGet("start") ?? 1),
          })
        )
        break
      case "blockquote_open":
        out.push({
          type: "blockquote",
          content: nonEmpty(blocks(ctx, "blockquote_close")),
        })
        break
      case "fence":
      case "code_block": {
        const language = (t.info ?? "").trim().split(/\s+/)[0] || null
        const text = t.content.replace(/\n$/, "")
        out.push({
          type: "codeBlock",
          attrs: { language },
          ...(text ? { content: [{ type: "text", text }] } : {}),
        })
        break
      }
      case "hr":
        out.push({ type: "horizontalRule" })
        break
      case "html_block":
        throw new MarkdownImportError("HTML is not allowed in Markdown")
      default:
        break
    }
  }
  return out
}

function nonEmpty(nodes: Node[]): Node[] {
  return nodes.length > 0 ? nodes : [{ type: "paragraph" }]
}

function list(
  ctx: Ctx,
  closeType: string,
  type: "bulletList" | "orderedList",
  attrs: Record<string, unknown>
): Node {
  const items: Node[][] = []
  while (ctx.i < ctx.tokens.length) {
    const t = ctx.tokens[ctx.i++]
    if (t.type === closeType) break
    if (t.type === "list_item_open") {
      const body = blocks(ctx, "list_item_close")
      // A list item starts with a paragraph.
      items.push(body[0]?.type === "paragraph" ? body : [{ type: "paragraph" }, ...body])
    }
  }

  const checks = items.map((body) => taskPrefix(body[0]))
  if (type === "bulletList" && items.length > 0 && checks.every((c) => c !== null)) {
    return {
      type: "taskList",
      content: items.map((body, k) => ({
        type: "taskItem",
        attrs: { checked: checks[k]!.checked },
        content: [stripPrefix(body[0], checks[k]!.length), ...body.slice(1)],
      })),
    }
  }
  return {
    type,
    ...(type === "orderedList" ? { attrs } : {}),
    content: items.map((body) => ({ type: "listItem", content: body })),
  }
}

/** `[ ] ` or `[x] ` at the start of a list item's first line. */
function taskPrefix(paragraph: Node): { checked: boolean; length: number } | null {
  const text = paragraph.content?.[0]
  if (text?.type !== "text") return null
  const match = /^\[([ xX])\] /.exec(text.text ?? "")
  return match ? { checked: match[1] !== " ", length: match[0].length } : null
}

function stripPrefix(paragraph: Node, length: number): Node {
  const [first, ...rest] = paragraph.content ?? []
  const text = (first.text ?? "").slice(length)
  const content = text ? [{ ...first, text }, ...rest] : rest
  return { type: "paragraph", ...(content.length ? { content } : {}) }
}

/**
 * One inline token as blocks: the text runs wrapped by `wrap`, and each image as
 * its own block, because images are block nodes in the schema.
 */
function inlineBlocks(ctx: Ctx, inline: Token, wrap: () => Node): Node[] {
  const out: Node[] = []
  let run: Node[] = []
  const stack: (Mark | null)[] = []
  const active = () => stack.filter((m): m is Mark => m !== null)

  const flush = (force: boolean) => {
    if (run.length > 0 || force) {
      out.push({ ...wrap(), ...(run.length ? { content: run } : {}) })
    }
    run = []
  }
  const push = (text: string, marks: Mark[]) => {
    if (!text) return
    const last = run[run.length - 1]
    if (last?.type === "text" && sameMarks(last.marks, marks)) {
      last.text += text
      return
    }
    run.push({ type: "text", text, ...(marks.length ? { marks } : {}) })
  }
  const open = (mark: Mark | null) => stack.push(mark)

  for (const c of inline.children ?? []) {
    switch (c.type) {
      case "text":
        push(c.content, active())
        break
      case "softbreak":
        push(" ", active())
        break
      case "hardbreak":
        run.push({ type: "hardBreak" })
        break
      case "code_inline":
        // The code mark excludes every other mark.
        push(c.content, [{ type: "code" }])
        break
      case "strong_open":
        open({ type: "bold" })
        break
      case "em_open":
        open({ type: "italic" })
        break
      case "s_open":
        open({ type: "strike" })
        break
      case "link_open": {
        const href = c.attrGet("href") ?? ""
        if (isAllowedLinkHref(href)) {
          open({ type: "link", attrs: { href, ...LINK_ATTRS } })
        } else {
          ctx.dropped.add("links that are not http, https or mailto")
          open(null)
        }
        break
      }
      case "strong_close":
      case "em_close":
      case "s_close":
      case "link_close":
        stack.pop()
        break
      case "image": {
        const src = c.attrGet("src") ?? ""
        if (/^https:/i.test(src) && isAllowedImageSrc(src)) {
          flush(false)
          out.push({
            type: "image",
            attrs: {
              src,
              alt: c.content || null,
              title: c.attrGet("title") || null,
            },
          })
        } else {
          ctx.dropped.add("images that are not https links")
        }
        break
      }
      case "html_inline":
        throw new MarkdownImportError("HTML is not allowed in Markdown")
      default:
        break
    }
  }
  flush(out.length === 0)
  return out
}

function sameMarks(a: Mark[] = [], b: Mark[] = []): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function plainText(node: Node): string {
  if (node.type === "text") return node.text ?? ""
  return (node.content ?? []).map(plainText).join("")
}

// ── Document → Markdown ────────────────────────────────────────────

/**
 * Converts an editor document to Markdown. What Markdown cannot carry
 * (underline, file cards, uploaded images, page mentions) is reduced to text or
 * left out, and named in `lost`.
 */
export function docToMarkdown(doc: unknown): MarkdownExport {
  const lost = new Set<string>()
  const root = doc as Node | null
  const markdown = blocksToMd(root?.content ?? [], lost)
  return { markdown: markdown ? `${markdown}\n` : "", lost: [...lost] }
}

function blocksToMd(nodes: Node[], lost: Set<string>): string {
  return nodes
    .map((n) => blockToMd(n, lost))
    .filter((s) => s !== "")
    .join("\n\n")
}

function blockToMd(n: Node, lost: Set<string>): string {
  switch (n.type) {
    case "paragraph":
      return escapeBlockStart(inlineToMd(n.content, lost))
    case "heading": {
      const text = inlineToMd(n.content, lost)
      return text ? `${"#".repeat(Number(n.attrs?.level ?? 1))} ${text}` : ""
    }
    case "bulletList":
      return listToMd(n.content, () => "- ", lost)
    case "orderedList": {
      const start = Number(n.attrs?.start ?? 1)
      return listToMd(n.content, (_, k) => `${start + k}. `, lost)
    }
    case "taskList":
      return listToMd(
        n.content,
        (item) => (item.attrs?.checked ? "- [x] " : "- [ ] "),
        lost
      )
    case "blockquote": {
      const inner = blocksToMd(n.content ?? [], lost)
      return inner
        ? inner
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n")
        : ""
    }
    case "codeBlock": {
      const text = plainText(n)
      const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length))
      const fence = "`".repeat(Math.max(3, longest + 1))
      const language = typeof n.attrs?.language === "string" ? n.attrs.language : ""
      return `${fence}${language}\n${text}\n${fence}`
    }
    case "horizontalRule":
      return "---"
    case "image": {
      const src = String(n.attrs?.src ?? "")
      if (!/^https:/i.test(src)) {
        lost.add("images stored in Cluster")
        return ""
      }
      const alt = escapeText(String(n.attrs?.alt ?? ""))
      const title = n.attrs?.title ? ` "${String(n.attrs.title).replace(/"/g, '\\"')}"` : ""
      return `![${alt}](${encodeHref(src)}${title})`
    }
    case "fileCard":
      lost.add("file attachments")
      return ""
    default:
      lost.add(`content of type "${n.type}"`)
      return ""
  }
}

function listToMd(
  items: Node[] = [],
  marker: (item: Node, index: number) => string,
  lost: Set<string>
): string {
  return items
    .map((item, k) => {
      const m = marker(item, k)
      const parts = (item.content ?? [])
        .map((child) => ({ child, md: blockToMd(child, lost) }))
        .filter((p) => p.md !== "")
      let body = ""
      parts.forEach((p, idx) => {
        const nested = p.child.type?.endsWith("List")
        body += idx === 0 ? p.md : `${nested ? "\n" : "\n\n"}${p.md}`
      })
      const indent = " ".repeat(m.length)
      return `${m}${body
        .split("\n")
        .map((line, idx) => (idx === 0 || line === "" ? line : indent + line))
        .join("\n")}`.trimEnd()
    })
    .join("\n")
}

function inlineToMd(nodes: Node[] = [], lost: Set<string>): string {
  const merged: Node[] = []
  for (const n of nodes) {
    const last = merged[merged.length - 1]
    if (n.type === "text" && last?.type === "text" && sameMarks(last.marks, n.marks)) {
      last.text = (last.text ?? "") + (n.text ?? "")
    } else {
      merged.push({ ...n })
    }
  }
  return merged
    .map((n) => {
      if (n.type === "hardBreak") return "\\\n"
      if (n.type === "pageMention") {
        lost.add("page mentions (kept as text)")
        return escapeText(String(n.attrs?.label ?? ""))
      }
      if (n.type === "text") return textToMd(n, lost)
      lost.add(`content of type "${n.type}"`)
      return ""
    })
    .join("")
}

function textToMd(n: Node, lost: Set<string>): string {
  const marks = n.marks ?? []
  const text = n.text ?? ""
  const has = (type: string) => marks.some((m) => m.type === type)
  if (has("underline")) lost.add("underline")

  const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(text) ?? ["", "", text, ""]
  if (!core) return text
  if (has("code")) return `${lead}${codeSpan(core)}${trail}`

  let out = escapeText(core)
  // Emphasis cannot start or end with a space, so the spaces stay outside.
  if (has("bold")) out = `**${out}**`
  if (has("italic")) out = `*${out}*`
  if (has("strike")) out = `~~${out}~~`
  const link = marks.find((m) => m.type === "link")
  if (link) out = `[${out}](${encodeHref(String(link.attrs?.href ?? ""))})`
  return `${lead}${out}${trail}`
}

function codeSpan(text: string): string {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((r) => r.length))
  const fence = "`".repeat(longest + 1)
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : ""
  return `${fence}${pad}${text}${pad}${fence}`
}

function escapeText(text: string): string {
  return text.replace(/[\\`*_[\]<>~]/g, "\\$&")
}

/** A paragraph that would read as another block (heading, list, rule) once re-imported. */
function escapeBlockStart(text: string): string {
  // `\1` is not an escape in Markdown: the delimiter is the one to escape.
  const numbered = /^(\d+)([.)])(\s|$)/.exec(text)
  if (numbered) return `${numbered[1]}\\${text.slice(numbered[1].length)}`
  return /^(#{1,6}(\s|$)|[-+](\s|$)|-{3,}|={2,})/.test(text) ? `\\${text}` : text
}

function encodeHref(href: string): string {
  return href.replace(/ /g, "%20").replace(/\(/g, "%28").replace(/\)/g, "%29")
}
