export const SECTION_ORDER = [
  "overview",
  "evaluate",
  "self-host",
  "administration",
  "know",
  "grow",
  "account",
  "help",
  "connect",
  "changelog",
] as const

export type NavPage = { path: string; frontmatter: { title: string; description?: string; section: string; order: number } }
export type NavSection = { section: string; items: NavPage[] }

// Sections in SECTION_ORDER; pages inside by `order`. The changelog is newest first.
export function buildNav(pages: readonly NavPage[]): NavSection[] {
  return SECTION_ORDER.map((section) => {
    const items = pages
      .filter((p) => p.frontmatter.section === section)
      .sort((a, b) => a.frontmatter.order - b.frontmatter.order)
    if (section === "changelog") items.reverse()
    return { section, items }
  }).filter((s) => s.items.length > 0)
}

export function flatNav(nav: readonly NavSection[]): NavPage[] {
  return nav.flatMap((s) => s.items)
}

export function neighbours(nav: readonly NavSection[], path: string): { prev?: NavPage; next?: NavPage } {
  const flat = flatNav(nav)
  const i = flat.findIndex((p) => p.path === path)
  if (i === -1) return {}
  return { prev: flat[i - 1], next: flat[i + 1] }
}
