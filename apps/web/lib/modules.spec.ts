import type { AuthUser, ModuleKey } from "./api"
import { MODULE_ORDER, homePath } from "./modules"
import { visibleNavGroups } from "./navigation"

const user = (modules: ModuleKey[], role: AuthUser["role"] = "COLLABORATOR") =>
  ({ modules, role, isSuperAdmin: false }) as AuthUser

describe("homePath", () => {
  it("lands on CONNECT feed when every module is enabled", () => {
    expect(homePath(user(["KNOW", "GROW", "CONNECT", "LIFE"]))).toBe(
      "/connect/feed",
    )
  })

  it("lands on KNOW when only KNOW and GROW are enabled", () => {
    expect(homePath(user(["KNOW", "GROW"]))).toBe("/know")
  })

  it("lands on GROW when only GROW is enabled", () => {
    expect(homePath(user(["GROW"]))).toBe("/grow")
  })

  it("falls back to organization settings for an admin with no modules", () => {
    expect(homePath(user([], "ADMIN"))).toBe("/settings/organization")
  })

  it("falls back to account settings for a collaborator with no modules", () => {
    expect(homePath(user([], "COLLABORATOR"))).toBe("/settings/account")
  })

  it("skips enabled modules that have no landing route", () => {
    expect(homePath(user(["LIFE"]))).toBe("/settings/account")
  })
})

describe("MODULE_ORDER", () => {
  it("lists CONNECT first, then KNOW, GROW and LIFE", () => {
    expect(MODULE_ORDER).toEqual(["CONNECT", "KNOW", "GROW", "LIFE"])
  })
})

describe("visibleNavGroups", () => {
  it("shows module groups in MODULE_ORDER with Settings last", () => {
    const titles = visibleNavGroups(
      user(["KNOW", "GROW", "CONNECT", "LIFE"], "ADMIN"),
    ).map((group) => group.title)
    expect(titles).toEqual(["CONNECT", "KNOW", "GROW", "Settings"])
  })
})
