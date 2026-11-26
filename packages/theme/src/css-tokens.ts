import type { TokenSet } from "./contrast"

// Custom properties of one block, e.g. `:root { … }` or `.dark { … }`.
export function readBlock(css: string, selector: ":root" | ".dark"): TokenSet {
  const start = css.search(
    new RegExp(`^${selector.replace(".", "\\.")}\\s*\\{`, "m")
  )
  if (start < 0) throw new Error(`No ${selector} block in globals.css`)
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start))
  const tokens: TokenSet = {}
  for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim()
  }
  return tokens
}
