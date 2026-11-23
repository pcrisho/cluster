// Heading anchors: lowercase, accents removed, dashes; a repeat gets -2, -3… (spec: design §2).
// Shared by the Markdown plugin (ids in the page) and the table of contents (links to them).
export function headingSlug(text: string, seen: Map<string, number>): string {
  const base =
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "section"
  const n = seen.get(base) ?? 0
  seen.set(base, n + 1)
  return n === 0 ? base : `${base}-${n + 1}`
}
