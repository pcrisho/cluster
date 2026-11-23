import { BASE } from "./base"
import { RADIUS_REM } from "./catalog"
import { deriveTheme } from "./derive"
import { glassCss, type GlassKey } from "./glass"
import type { Seeds } from "./seeds"

// default -> instance -> organization: colours are one block, font and radius inherit on their own.
export function resolveSeeds(instance: Seeds, org: Seeds | null): Seeds {
  const colours = org?.brandPrimary ? org : instance
  return {
    brandPrimary: colours.brandPrimary,
    brandSecondary: colours.brandSecondary,
    fontKey: org?.fontKey ?? instance.fontKey,
    radiusKey: org?.radiusKey ?? instance.radiusKey,
  }
}

const block = (selector: string, decls: string[]) =>
  `${selector}{${decls.join(";")}}`

const decls = (tokens: Record<string, string>) =>
  Object.entries(tokens).map(([name, value]) => `--${name}:${value}`)

// Seeds must come from parseSeeds and the glass key from parseGlass (only #rrggbb and catalogue keys reach the CSS).
// With glass on, its blocks follow the theme's, tuned to the brand colour in use (the derived one, else the default).
export function themeCss(
  seeds: Seeds,
  glassKey: GlassKey | null = null
): string {
  const derived = seeds.brandPrimary
    ? deriveTheme({
        primary: seeds.brandPrimary,
        secondary: seeds.brandSecondary,
      })
    : null
  const root = [
    ...(derived ? decls(derived.light) : []),
    ...(seeds.radiusKey ? [`--radius:${RADIUS_REM[seeds.radiusKey]}rem`] : []),
    ...(seeds.fontKey ? [`--font-sans:var(--font-${seeds.fontKey})`] : []),
  ]
  const glass = glassCss(glassKey, {
    light: derived?.light.primary ?? BASE.light.primary,
    dark: derived?.dark.primary ?? BASE.dark.primary,
  })
  if (!root.length) return glass
  return (
    block("html:root", root) +
    (derived ? block("html.dark", decls(derived.dark)) : "") +
    glass
  )
}
