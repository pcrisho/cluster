import { buildNav, neighbours, type NavPage } from "./nav"

const p = (path: string, section: string, order: number): NavPage => ({
  path,
  frontmatter: { title: path, section, order },
})

describe("buildNav", () => {
  const pages = [
    p("know/b", "know", 2),
    p("overview/a", "overview", 1),
    p("know/a", "know", 1),
    p("changelog/v0-1-0", "changelog", 1),
    p("changelog/v0-2-0", "changelog", 2),
  ]

  it("orders sections as declared and pages by order", () => {
    const nav = buildNav(pages)
    expect(nav.map((s) => s.section)).toEqual(["overview", "know", "changelog"])
    expect(nav[1].items.map((x) => x.path)).toEqual(["know/a", "know/b"])
  })

  it("lists the changelog newest first", () => {
    const changelog = buildNav(pages).find((s) => s.section === "changelog")!
    expect(changelog.items.map((x) => x.path)).toEqual(["changelog/v0-2-0", "changelog/v0-1-0"])
  })

  it("gives the previous and next page across sections", () => {
    const nav = buildNav(pages)
    expect(neighbours(nav, "know/a")).toEqual({ prev: pages[1], next: pages[0] })
    expect(neighbours(nav, "overview/a").prev).toBeUndefined()
    expect(neighbours(nav, "missing")).toEqual({})
  })
})
