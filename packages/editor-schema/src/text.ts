type Node = {
  type?: string
  text?: string
  attrs?: { label?: string }
  content?: Node[]
}

// Nodes that sit inside a line of text; everything else is a block that gets a space around it.
const INLINE = new Set(["text", "hardBreak", "pageMention"])

/** Plain text of a rich-text document, used as the search index of a page. */
export function extractText(node: unknown): string {
  const n = node as Node | null
  if (!n || typeof n !== "object") return ""
  if (n.type === "text") return n.text ?? ""
  if (n.type === "pageMention") return n.attrs?.label ?? ""
  const children = Array.isArray(n.content) ? n.content : []
  const separator = children.some((c) => INLINE.has(c.type ?? "")) ? "" : " "
  return children.map(extractText).join(separator).trim()
}
