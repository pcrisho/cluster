import { allows, spaceRole, spaceRoles } from "./space-access"

describe("spaceRole", () => {
  it("makes ADMIN a manager everywhere, restricted or not", () => {
    expect(spaceRole({ isAdmin: true, restricted: true, matchedRoles: [] })).toBe("MANAGER")
    expect(spaceRole({ isAdmin: true, restricted: false, matchedRoles: [] })).toBe("MANAGER")
  })
  it("lets everyone read an open space and nobody without an entry read a restricted one", () => {
    expect(spaceRole({ isAdmin: false, restricted: false, matchedRoles: [] })).toBe("VIEWER")
    expect(spaceRole({ isAdmin: false, restricted: true, matchedRoles: [] })).toBeNull()
  })
  it("uses the strongest matching entry, in open and restricted spaces", () => {
    expect(spaceRole({ isAdmin: false, restricted: true, matchedRoles: ["VIEWER", "EDITOR"] })).toBe("EDITOR")
    expect(spaceRole({ isAdmin: false, restricted: false, matchedRoles: ["MANAGER", "VIEWER"] })).toBe("MANAGER")
    expect(spaceRole({ isAdmin: false, restricted: false, matchedRoles: ["VIEWER"] })).toBe("VIEWER")
  })
})

describe("allows", () => {
  it("orders read < edit < manage and denies the invisible", () => {
    expect(allows("VIEWER", "READ")).toBe(true)
    expect(allows("VIEWER", "EDIT")).toBe(false)
    expect(allows("EDITOR", "EDIT")).toBe(true)
    expect(allows("EDITOR", "MANAGE")).toBe(false)
    expect(allows("MANAGER", "MANAGE")).toBe(true)
    expect(allows(null, "READ")).toBe(false)
  })
})

describe("spaceRoles", () => {
  it("defaults open spaces to viewer, opens restricted ones through entries and keeps the strongest role", () => {
    const roles = spaceRoles(["open", "open2"], [
      { spaceId: "a", role: "VIEWER" },
      { spaceId: "b", role: "EDITOR" },
      { spaceId: "b", role: "VIEWER" },
      { spaceId: "open", role: "MANAGER" },
    ])
    expect(Object.fromEntries(roles)).toEqual({ open: "MANAGER", open2: "VIEWER", a: "VIEWER", b: "EDITOR" })
  })
  it("is empty without spaces", () => {
    expect(spaceRoles([], []).size).toBe(0)
  })
})
