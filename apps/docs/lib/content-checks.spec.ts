import type { DocPage } from "./content"
import { checkChangelog, checkContent, checkForbidden, checkImages, checkOrder, checkParity, checkSelfHost, type ContentInput } from "./content-checks"

const DESC = "A description that is long enough to pass the fifty character minimum rule."

function page(locale: string, path: string, body = "Text.", over: Partial<DocPage["frontmatter"]> = {}): DocPage {
  const [section, slug] = path.split("/")
  return {
    locale,
    path,
    body,
    frontmatter: { title: slug, description: DESC, section, order: 1, ...over },
  }
}

const base: ContentInput = {
  locales: ["en", "es"],
  pages: [page("en", "overview/a"), page("es", "overview/a")],
  forbidden: [],
  envKeys: new Set(["JWT_SECRET"]),
  services: new Set(["api", "postgres"]),
}

describe("content rules", () => {
  it("passes a clean, paired tree", () => {
    expect(checkContent(base)).toEqual([])
  })

  it("reports a page that exists in one language only", () => {
    const errors = checkParity({ ...base, pages: [page("en", "overview/a"), page("en", "overview/b"), page("es", "overview/a")] })
    expect(errors).toEqual(["overview/b: missing in es"])
  })

  it("reports two pages with the same order in one section", () => {
    const errors = checkOrder({
      ...base,
      pages: [page("en", "know/a", "x", { section: "know", order: 2 }), page("en", "know/b", "x", { section: "know", order: 2 })],
    })
    expect(errors).toHaveLength(1)
  })

  it("rejects links into docs/ and issue numbers", () => {
    expect(checkForbidden({ ...base, pages: [page("en", "overview/a", "See [spec](../../docs/specs/x.md).")] })).toHaveLength(1)
    expect(checkForbidden({ ...base, pages: [page("en", "overview/a", "Fixed in #17.")] })).toHaveLength(1)
  })

  it("rejects a forbidden value wherever it appears", () => {
    const pages = [page("es", "overview/a", "Usa la clave Cluster-demo-2026.")]
    expect(checkForbidden({ ...base, pages, forbidden: ["Cluster-demo-2026"] })).toHaveLength(1)
  })

  it("requires alt text on every image and a root or https source", () => {
    expect(checkImages({ ...base, pages: [page("en", "overview/a", "![](/s/a.png)")] })).toHaveLength(1)
    expect(checkImages({ ...base, pages: [page("en", "overview/a", "![Alt](screens/a.png)")] })).toHaveLength(1)
    expect(checkImages({ ...base, pages: [page("en", "overview/a", "![Alt](/s/a.png)")] })).toEqual([])
  })

  it("rejects a self-host variable that is not in .env.example", () => {
    const pages = [page("en", "self-host/env", "Set `JWT_SECRET` and `JWT_OLD_KEY`.", { section: "self-host" })]
    expect(checkSelfHost({ ...base, pages })).toEqual(["en/self-host/env: documents JWT_OLD_KEY, which is not in .env.example"])
  })

  it("does not read the word after a backticked flag as a service", () => {
    const pages = [page("en", "self-host/ops", "Run `docker compose up -d` again.", { section: "self-host" })]
    expect(checkSelfHost({ ...base, pages })).toEqual([])
  })

  it("rejects a compose service that is not in docker-compose.yml", () => {
    const pages = [page("en", "self-host/ops", "Run `docker compose exec -T api node x.js` and `docker compose logs worker`.", { section: "self-host" })]
    expect(checkSelfHost({ ...base, pages })).toEqual(['en/self-host/ops: names service "worker", which is not in docker-compose.yml'])
  })

  it("requires a changelog entry in every locale for each release tag", () => {
    const pages = [page("en", "changelog/0-1-0", "Release.", { section: "changelog" })]
    expect(checkChangelog({ ...base, pages, tags: ["v0.1.0"] })).toEqual([
      "changelog/0-1-0 (es): missing changelog entry for release tag v0.1.0",
    ])
  })
})
