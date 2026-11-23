import { existsSync } from "node:fs"
import { join } from "node:path"

// A screenshot `/screenshots/<name>-light.png` has its dark twin `/screenshots/<name>-dark.png`.
export function darkVariant(src: string): string | undefined {
  const m = /^(\/screenshots\/.+)-light\.png$/.exec(src)
  return m ? `${m[1]}-dark.png` : undefined
}

// The dark twin's URL when the file is in public/ (checked at build), else undefined.
export function darkSibling(src: string, publicDir = join(process.cwd(), "public")): string | undefined {
  const dark = darkVariant(src)
  return dark && existsSync(join(publicDir, dark)) ? dark : undefined
}
