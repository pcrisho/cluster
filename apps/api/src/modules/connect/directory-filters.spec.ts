import "reflect-metadata" // the DTO enums live next to class-validator decorators
import { buildDirectoryWhere } from "./directory-filters"
import { ListFilterOp, TextFilterOp } from "./dto/directory-query.dto"

describe("buildDirectoryWhere", () => {
  it("always scopes to the organization's active members", () => {
    expect(buildDirectoryWhere("org-1", {})).toEqual({
      organizationId: "org-1",
      isActive: true,
      AND: [],
    })
  })

  it("ignores blank text filters", () => {
    expect(buildDirectoryWhere("o", { search: "  ", name: "", email: " " }).AND).toEqual([])
  })

  it("negates 'not contains' and 'not in' instead of requiring the field to exist", () => {
    const { AND } = buildDirectoryWhere("o", {
      email: "corp",
      emailOp: TextFilterOp.NOT_CONTAINS,
      orgNodeIds: ["a"],
      orgNodeIdsOp: ListFilterOp.NOT_IN,
    })
    expect(AND).toEqual([
      { NOT: { email: { contains: "corp", mode: "insensitive" } } },
      { NOT: { profile: { orgNodeId: { in: ["a"] } } } },
    ])
  })

  it("matches a name against first or last name", () => {
    const { AND } = buildDirectoryWhere("o", { name: "ana", nameOp: TextFilterOp.STARTS_WITH })
    expect(AND).toEqual([
      {
        OR: [
          { firstName: { startsWith: "ana", mode: "insensitive" } },
          { lastName: { startsWith: "ana", mode: "insensitive" } },
        ],
      },
    ])
  })
})
