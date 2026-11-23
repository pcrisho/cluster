import type { AuthUser } from "./api"
import { profileHref, visibleNavGroups } from "./navigation"

const user = (modules: AuthUser["modules"]) =>
  ({ modules }) as unknown as AuthUser

describe("visibleNavGroups", () => {
  it("lists the enabled modules in order, then Settings", () => {
    const titles = visibleNavGroups(user(["GROW", "KNOW", "CONNECT"])).map(
      (g) => g.title
    )
    expect(titles).toEqual(["CONNECT", "KNOW", "GROW", "Settings"])
  })

  it("drops a module the organization has switched off", () => {
    const titles = visibleNavGroups(user(["KNOW"])).map((g) => g.title)
    expect(titles).toEqual(["KNOW", "Settings"])
  })

  it("pins Settings to the bottom of the sidebar and nothing else", () => {
    const groups = visibleNavGroups(user(["KNOW", "GROW", "CONNECT"]))
    expect(groups.filter((g) => g.pinned).map((g) => g.title)).toEqual([
      "Settings",
    ])
  })

  it("gives each Connect link an icon of its own", () => {
    const [connect] = visibleNavGroups(user(["CONNECT"]))
    const icons = connect.subgroups[0].items.map((i) => i.icon)
    expect(new Set(icons).size).toBe(icons.length)
  })

  it("shows nothing to a signed-out visitor", () => {
    expect(visibleNavGroups(null)).toEqual([])
  })
})

describe("profileHref", () => {
  const person = (modules: AuthUser["modules"]) =>
    ({ id: "u1", modules }) as unknown as AuthUser

  it("opens the member profile when Connect is on", () => {
    expect(profileHref(person(["KNOW", "CONNECT"]))).toBe(
      "/connect/directory/u1"
    )
  })

  it("falls back to My account when Connect is off", () => {
    expect(profileHref(person(["KNOW", "GROW"]))).toBe("/settings/account")
  })
})
