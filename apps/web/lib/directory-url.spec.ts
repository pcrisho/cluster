import {
  DEFAULT_DIRECTORY_STATE,
  directoryHrefForAreas,
  parseDirectoryUrl,
  serializeDirectoryUrl,
  type DirectoryUrlState,
} from "./directory-url"

const parse = (qs: string) => parseDirectoryUrl(new URLSearchParams(qs))

describe("directory url", () => {
  it("leaves defaults out and reads an empty query as the defaults", () => {
    expect(serializeDirectoryUrl(DEFAULT_DIRECTORY_STATE).toString()).toBe("")
    expect(parse("")).toEqual(DEFAULT_DIRECTORY_STATE)
  })

  it("round-trips view, search, sort, page, size and filters, including : and | in values", () => {
    const state: DirectoryUrlState = {
      view: "grid",
      search: "ana & co",
      sort: "name-desc",
      page: 3,
      pageSize: 50,
      filters: [
        { id: "area", field: "area", operator: "not_in", values: ["a1", "a2"] },
        { id: "bio", field: "bio", operator: "contains", values: ["x:y|z"] },
        { id: "role", field: "role", operator: "in", values: [] },
      ],
    }
    expect(parse(serializeDirectoryUrl(state).toString())).toEqual(state)
  })

  it("falls back to defaults for invalid values", () => {
    const s = parse(
      "view=cards&sort=up&page=-2&size=7&f=nope:in:x&f=area:contains:x&f=area:in:%E0%A4%A"
    )
    expect(s).toEqual(DEFAULT_DIRECTORY_STATE)
    expect(parse("page=2.5").page).toBe(1)
  })

  it("keeps one filter per field and a single value for text fields", () => {
    const s = parse("f=area:in:a|b&f=area:in:c&f=name:contains:a|b")
    expect(s.filters.map((f) => [f.field, f.values])).toEqual([
      ["area", ["a", "b"]],
      ["name", ["a"]],
    ])
  })

  it("builds the link of an org chart node", () => {
    const href = directoryHrefForAreas(["a1", "a2"])
    expect(href.startsWith("/connect/directory?")).toBe(true)
    const s = parse(href.split("?")[1])
    expect(s.view).toBe("table")
    expect(s.filters).toEqual([
      { id: "area", field: "area", operator: "in", values: ["a1", "a2"] },
    ])
  })
})
