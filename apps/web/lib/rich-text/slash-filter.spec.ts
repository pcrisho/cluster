import { filterSlashItems } from "@/lib/rich-text/slash-filter"

const items = [
  {
    title: "Heading 1",
    description: "Big section heading.",
    searchTerms: ["title", "big", "large"],
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list.",
    searchTerms: ["unordered", "point"],
  },
  {
    title: "To-do List",
    description: "Track tasks with a to-do list.",
    searchTerms: ["todo", "task", "list", "check", "checkbox"],
  },
]

const titles = (result: { title: string }[]) => result.map((i) => i.title)

describe("filterSlashItems", () => {
  it("keeps every item for an empty query", () => {
    expect(filterSlashItems(items, "")).toEqual(items)
  })

  it("matches the title", () => {
    expect(titles(filterSlashItems(items, "heading"))).toEqual(["Heading 1"])
  })

  it("matches the description", () => {
    expect(titles(filterSlashItems(items, "simple"))).toEqual(["Bullet List"])
  })

  it("matches a search term", () => {
    expect(titles(filterSlashItems(items, "unordered"))).toEqual([
      "Bullet List",
    ])
  })

  it("returns several items when more than one matches", () => {
    expect(titles(filterSlashItems(items, "list"))).toEqual([
      "Bullet List",
      "To-do List",
    ])
  })

  it("returns nothing when no item matches", () => {
    expect(filterSlashItems(items, "table")).toEqual([])
  })

  it("ignores letter case in the query and in the items", () => {
    expect(titles(filterSlashItems(items, "HEADING"))).toEqual(["Heading 1"])
    expect(titles(filterSlashItems(items, "ToDo"))).toEqual(["To-do List"])
    expect(titles(filterSlashItems(items, "TASK"))).toEqual(["To-do List"])
  })

  it("matches a query that contains a space against the same text", () => {
    expect(titles(filterSlashItems(items, "bullet list"))).toEqual([
      "Bullet List",
    ])
    expect(filterSlashItems(items, "bullet  list")).toEqual([])
  })
})
