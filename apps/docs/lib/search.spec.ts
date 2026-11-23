import { matchesQuery, normalizeSearchText, parseExcerpt, resolveResultUrl, toSearchResult } from "./search"

describe("search helpers", () => {
  test("resolveResultUrl prefixes locale and strips index.html", () => {
    expect(resolveResultUrl("en", "/overview/what-is-cluster/index.html")).toBe(
      "/en/overview/what-is-cluster/"
    )
    expect(resolveResultUrl("es", "/es/overview/what-is-cluster/")).toBe(
      "/es/overview/what-is-cluster/"
    )
  })
  test("normalizes accents and case", () => {
    expect(normalizeSearchText("  Configuración y TÍTULO ")).toBe("configuracion y titulo")
  })

  test("matchesQuery requires all tokens in title, section, or content", () => {
    const item = {
      title: "What Cluster is",
      section: "Overview",
      content: "An open-source knowledge base and training platform.",
    }
    expect(matchesQuery("cluster platform", item)).toBe(true)
    expect(matchesQuery("overview", item)).toBe(true)
    expect(matchesQuery("aviso", item)).toBe(false)
    expect(matchesQuery("   ", item)).toBe(false)
  })

  test("matchesQuery is accent-insensitive for Spanish", () => {
    const item = {
      title: "Autenticación",
      section: "Cuenta",
      content: "Configura tu verificación en dos pasos.",
    }
    expect(matchesQuery("autenticacion verificacion", item)).toBe(true)
  })

  test("parseExcerpt extracts mark spans without HTML", () => {
    expect(parseExcerpt("Before <mark>Cluster</mark> and <b>more</b> <mark>docs</mark>.")).toEqual([
      { text: "Before ", hit: false },
      { text: "Cluster", hit: true },
      { text: " and more ", hit: false },
      { text: "docs", hit: true },
      { text: ".", hit: false },
    ])
  })

  test("toSearchResult filters out fuzzy non-matches", () => {
    const miss = toSearchResult("aviso", {
      url: "/en/overview/what-is-cluster/",
      content: "What Cluster is. Note and tip.",
      excerpt: "What <mark>Cluster</mark> is.",
      meta: { title: "What Cluster is", section: "Overview" },
    })
    expect(miss).toBeNull()

    const hit = toSearchResult("cluster", {
      url: "/en/overview/what-is-cluster/",
      content: "What Cluster is. Note and tip.",
      excerpt: "What <mark>Cluster</mark> is.",
      meta: { title: "What Cluster is", section: "Overview" },
    })
    expect(hit).toEqual({
      url: "/en/overview/what-is-cluster/",
      title: "What Cluster is",
      section: "Overview",
      excerpt: [
        { text: "What ", hit: false },
        { text: "Cluster", hit: true },
        { text: " is.", hit: false },
      ],
    })
  })
})
