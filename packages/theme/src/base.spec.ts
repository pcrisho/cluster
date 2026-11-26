import { readFileSync } from "fs"
import { join } from "path"

import { BASE } from "./base"
import { readBlock } from "./css-tokens"

const css = readFileSync(
  join(__dirname, "../../../apps/web/app/globals.css"),
  "utf8"
)
const light = readBlock(css, ":root")
const actual = { light, dark: { ...light, ...readBlock(css, ".dark") } }

// Guards drift between BASE and the defaults in globals.css.
describe.each(["light", "dark"] as const)("BASE %s", (theme) => {
  it.each(Object.keys(BASE[theme]))("%s matches globals.css", (key) => {
    expect(BASE[theme][key]).toBe(actual[theme][key])
  })

  it("holds exactly the brand tokens", () => {
    expect(Object.keys(BASE[theme]).sort()).toEqual(
      [
        "background",
        "card",
        "muted",
        "sidebar",
        "accent",
        "sidebar-accent",
        "primary",
        "primary-foreground",
        "sidebar-primary",
        "sidebar-primary-foreground",
        "secondary",
        "secondary-foreground",
        "cat-1",
      ].sort()
    )
  })
})
