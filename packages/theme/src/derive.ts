import { BASE } from "./base"
import {
  PAIRS,
  pairRatio,
  ratio,
  type Pair,
  type Theme,
  type TokenSet,
} from "./contrast"
import { hexToOklch, oklchToHex, type Oklch } from "./oklch"

// The tokens a brand seed overrides, by leader and followers: a follower goes back
// to its default together with its leader. Everything else keeps its globals.css value.
const GROUPS = [
  [
    "primary",
    "primary-foreground",
    "sidebar-primary",
    "sidebar-primary-foreground",
    "cat-1",
  ],
  ["secondary", "secondary-foreground"],
]
export const DERIVED_TOKENS = GROUPS.flat()

export interface DerivedTheme {
  light: TokenSet
  dark: TokenSet
  // Set when the light primary is not the seed as typed (it failed contrast).
  adjusted: { from: string; to: string } | null
}

// The pairs a seed can break: the whole contract the derivation searches against.
const AFFECTED = PAIRS.filter((pair) =>
  [pair.fg, pair.bg, pair.base].some(
    (token) => token !== undefined && DERIVED_TOKENS.includes(token)
  )
)
const floor = (pair: Pair) => pair.min
const goal = (pair: Pair) => pair.goal ?? pair.min

// Tinted near-white or near-black, whichever reads better on `primary`.
function foregroundOn(primary: string): string {
  const { c, h } = hexToOklch(primary)
  const light = oklchToHex({ l: 0.985, c: Math.min(c, 0.02), h })
  const dark = oklchToHex({ l: 0.22, c: Math.min(c, 0.08), h })
  return ratio(light, primary) >= ratio(dark, primary) ? light : dark
}

// Ensures a chart series colour (`cat-1`) meets 3:1 against the page background without
// forcing `primary` buttons to wash out in dark mode or muddy in light mode.
function cat1For(theme: Theme, primary: string): string {
  const bg = BASE[theme].background
  if (ratio(primary, bg) >= 3) return primary
  const seed = hexToOklch(primary)
  let fail = seed.l
  let pass = theme === "light" ? 0 : 1
  for (let step = 0; step < 24; step++) {
    const mid = (fail + pass) / 2
    if (ratio(oklchToHex({ ...seed, l: mid }), bg) >= 3) pass = mid
    else fail = mid
  }
  return oklchToHex({ ...seed, l: pass })
}

const tint = (l: number, c: number, tone: Oklch) =>
  oklchToHex({ l, c: Math.min(c, tone.c), h: tone.h })

function tokensFor(theme: Theme, primary: string, tone: Oklch | null) {
  const foreground = foregroundOn(primary)
  const hue = tone ?? hexToOklch(primary)
  const [surface, text] =
    theme === "light"
      ? [tint(0.965, 0.006, hue), tint(0.2, 0.02, hue)]
      : [tint(0.27, 0.012, hue), tint(0.985, 0.004, hue)]
  return {
    primary,
    "primary-foreground": foreground,
    "sidebar-primary": primary,
    "sidebar-primary-foreground": foreground,
    secondary: surface,
    "secondary-foreground": text,
    "cat-1": cat1For(theme, primary),
  }
}

function passes(theme: Theme, tokens: TokenSet, min: (pair: Pair) => number) {
  const all = { ...BASE[theme], ...tokens }
  return AFFECTED.every((pair) => pairRatio(all, pair) >= min(pair))
}

// A seed that meets every floor stays as typed; one that does not moves until it
// meets every goal. shortcut: one lightness search; hue shifts from the sRGB gamut
// clip are not corrected. Upgrade when a saturated seed shows a visible hue drift
// in the browser checks.
function derive(theme: Theme, hex: string, tone: Oklch | null): TokenSet {
  const at = (primary: string) => tokensFor(theme, primary, tone)
  if (passes(theme, at(hex), floor)) return at(hex)
  // Darker on light surfaces, lighter on dark ones; black and white always pass.
  const seed = hexToOklch(hex)
  let fail = seed.l
  let pass = theme === "light" ? 0 : 1
  for (let step = 0; step < 24; step++) {
    const mid = (fail + pass) / 2
    if (passes(theme, at(oklchToHex({ ...seed, l: mid })), goal)) pass = mid
    else fail = mid
  }
  return fallBack(theme, at(oklchToHex({ ...seed, l: pass })))
}

// A token in a failing pair goes back to its default with its group (the defaults
// pass, contrast.spec.ts). Returns a copy.
export function fallBack(theme: Theme, input: TokenSet): TokenSet {
  const base = BASE[theme]
  const tokens = { ...input }
  for (;;) {
    const all = { ...base, ...tokens }
    const failing = AFFECTED.find((pair) => pairRatio(all, pair) < pair.min)
    if (!failing) return tokens
    const touched = [failing.fg, failing.bg, failing.base]
    const reverted = GROUPS.filter((group) =>
      group.some((token) => touched.includes(token))
    )
      .flat()
      .filter((token) => token in tokens && tokens[token] !== base[token])
    if (!reverted.length) {
      return Object.fromEntries(DERIVED_TOKENS.map((t) => [t, base[t]]))
    }
    for (const token of reverted) tokens[token] = base[token]
  }
}

export function deriveTheme(input: {
  primary: string
  secondary?: string | null
}): DerivedTheme {
  const seed = input.primary.toLowerCase()
  const tone = input.secondary ? hexToOklch(input.secondary) : null
  const light = derive("light", seed, tone)
  return {
    light,
    dark: derive("dark", seed, tone),
    adjusted: light.primary === seed ? null : { from: seed, to: light.primary },
  }
}
