import type { AuthUser } from "./api"
import { settingsSections } from "./settings-nav"

const user = (role: AuthUser["role"], isSuperAdmin = false) =>
  ({ role, isSuperAdmin, modules: [] }) as unknown as AuthUser

const titles = (u: AuthUser | null) => settingsSections(u).map((s) => s.title)
const hrefs = (u: AuthUser | null, title: string) =>
  settingsSections(u)
    .find((s) => s.title === title)
    ?.items.map((i) => i.href)

describe("settingsSections", () => {
  it("shows only Personal to a collaborator", () => {
    expect(titles(user("COLLABORATOR"))).toEqual(["personal"])
  })

  it("shows only Personal to a manager", () => {
    expect(titles(user("MANAGER"))).toEqual(["personal"])
  })

  it("shows Personal and Organization to an admin, in order", () => {
    expect(titles(user("ADMIN"))).toEqual(["personal", "organizationSection"])
    expect(hrefs(user("ADMIN"), "organizationSection")).toEqual([
      "/settings/organization",
      "/settings/members",
      "/settings/areas",
      "/settings/positions",
      "/settings/assignments",
      "/settings/appearance",
      "/settings/activity",
    ])
  })

  it("shows Personal and Instance to a superadmin who is a collaborator", () => {
    expect(titles(user("COLLABORATOR", true))).toEqual([
      "personal",
      "instanceSection",
    ])
    expect(hrefs(user("COLLABORATOR", true), "instanceSection")).toEqual([
      "/settings/instance",
    ])
  })

  it("shows every section to an admin who is a superadmin", () => {
    expect(titles(user("ADMIN", true))).toEqual([
      "personal",
      "organizationSection",
      "instanceSection",
    ])
  })

  it("returns nothing without a user", () => {
    expect(settingsSections(null)).toEqual([])
  })
})
