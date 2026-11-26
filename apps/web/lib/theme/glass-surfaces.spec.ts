import { readdirSync, readFileSync } from "fs"
import { join } from "path"

// Guards docs/specs/org/glass: every `*-content` / `*-viewport` slot in components/ui is either
// styled by the glass block of globals.css or listed here with the reason it is not a surface.
const root = join(__dirname, "../..")
const css = readFileSync(join(root, "app/globals.css"), "utf8")

const NOT_GLASS: Record<string, string> = {
  "accordion-content": "inline content",
  "card-content": "inline content",
  "collapsible-content": "inline content",
  "empty-content": "inline content",
  "field-content": "inline content",
  "field-separator-content": "inline content",
  "item-content": "inline content",
  "pagination-content": "inline content",
  "scroll-area-viewport": "inline content",
  "sidebar-content": "inline content",
  "sidebar-group-content": "inline content",
  "tabs-content": "inline content",
  "tooltip-content": "inverted and tiny: solid by design",
  "navigation-menu-content": "not used in the app: classify it when it is",
  "navigation-menu-viewport": "not used in the app: classify it when it is",
}

const block = /\/\* glass-surfaces:start \*\/([\s\S]*?)\/\* glass-surfaces:end \*\//.exec(
  css
)
const glass = [...(block?.[1] ?? "").matchAll(/data-slot="([a-z-]+)"/g)].map(
  (match) => match[1]
)

const uiDir = join(root, "components/ui")
const slots = [
  ...new Set(
    readdirSync(uiDir)
      .filter((file) => file.endsWith(".tsx"))
      .flatMap((file) =>
        [
          ...readFileSync(join(uiDir, file), "utf8").matchAll(
            /data-slot="([a-z-]+-(?:content|viewport))"/g
          ),
        ].map((match) => match[1])
      )
  ),
].sort()

describe("glass surfaces", () => {
  it("has a marked block in globals.css", () => {
    expect(block).not.toBeNull()
    expect(glass.length).toBeGreaterThan(0)
  })

  it.each(slots)("%s is classified", (slot) => {
    const inGlass = glass.includes(slot)
    const excluded = slot in NOT_GLASS
    expect(inGlass || excluded).toBe(true)
    expect(inGlass && excluded).toBe(false)
  })

  it("lists no slot that no component has any more", () => {
    for (const slot of [...glass, ...Object.keys(NOT_GLASS)]) {
      expect(slots).toContain(slot)
    }
  })

  it("covers the menus and the modals of the spec", () => {
    expect(glass).toEqual(
      expect.arrayContaining([
        "dropdown-menu-content",
        "select-content",
        "popover-content",
        "context-menu-content",
        "menubar-content",
        "combobox-content",
        "hover-card-content",
        "dialog-content",
        "alert-dialog-content",
        "sheet-content",
        "drawer-content",
      ])
    )
  })

  it("falls back to solid for the three cases of the spec", () => {
    expect(css).toContain("prefers-reduced-transparency: reduce")
    expect(css).toContain("prefers-contrast: more")
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\)/)
  })

  it("only acts when the instance turned glass on", () => {
    const section = css
      .slice(css.indexOf("/* ─── Glass surfaces (docs/specs/org/glass)"))
      .replace(/\/\*[\s\S]*?\*\//g, "")
    const selectors = section
      .split("{")
      .slice(0, -1)
      .map((part) => part.split("}").pop()!.trim())
      .filter((selector) => selector && !selector.startsWith("@"))
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) {
      expect(selector).toContain("[data-glass]")
    }
  })
})
