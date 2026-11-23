// Contrast check for the colour tokens in app/globals.css (`pnpm verify:tokens`).
// Pure: resolves hex values (alpha composited over the surface below) and
// computes WCAG ratios. The `:root`/`.dark` text is read by css-tokens.ts.

export type Theme = "light" | "dark"
export type TokenSet = Record<string, string>

export interface Pair {
  fg: string
  bg: string
  // Optional surface under a translucent `bg` (a `-subtle` fill on a card).
  base?: string
  // `bg` drawn at this opacity over `base` (`hover:bg-primary/80`).
  alpha?: number
  min: number
  // What deriveTheme aims for when it has to move a seed; defaults to `min`.
  goal?: number
  // Optional theme restriction: when omitted, applies to both light and dark.
  theme?: Theme
}

const TEXT = 4.5
const MARK = 3

const TONES = ["success", "warning", "info", "danger", "neutral"]
const SURFACES = ["background", "card"]
const HOVER = { fg: "primary-foreground", bg: "primary", alpha: 0.8 }

export const PAIRS: Pair[] = [
  ...["background", "card", "popover", "muted"].map((bg) => ({
    fg: "foreground",
    bg,
    min: TEXT,
  })),
  ...["background", "card", "muted", "sidebar"].map((bg) => ({
    fg: "muted-foreground",
    bg,
    min: TEXT,
  })),
  { fg: "card-foreground", bg: "card", min: TEXT },
  { fg: "popover-foreground", bg: "popover", min: TEXT },
  { fg: "primary-foreground", bg: "primary", min: TEXT },
  // Hover of the primary button and badge (`hover:bg-primary/80`). Floor stays above 3:1 UI threshold.
  { ...HOVER, base: "background", min: 3.5, goal: TEXT },
  { ...HOVER, base: "card", min: 3.5, goal: TEXT },
  // Brand surface distinguishability against the page background (shadcn-style: keeps brand colours
  // vibrant across both light and dark modes while still preventing invisible white-on-white or
  // black-on-black buttons).
  { fg: "primary", bg: "background", min: 1.8, goal: MARK },
  { fg: "secondary-foreground", bg: "secondary", min: TEXT },
  { fg: "accent-foreground", bg: "accent", min: TEXT },
  ...SURFACES.map((bg) => ({ fg: "destructive", bg, min: TEXT })),
  { fg: "sidebar-foreground", bg: "sidebar", min: TEXT },
  { fg: "sidebar-accent-foreground", bg: "sidebar-accent", min: TEXT },
  { fg: "sidebar-primary-foreground", bg: "sidebar-primary", min: TEXT },
  ...SURFACES.map((bg) => ({ fg: "ring", bg, min: MARK })),
  ...TONES.flatMap((tone) => [
    ...SURFACES.map((bg) => ({ fg: `${tone}-text`, bg, min: TEXT })),
    ...SURFACES.map((base) => ({
      fg: `${tone}-text`,
      bg: `${tone}-subtle`,
      base,
      min: TEXT,
    })),
    ...SURFACES.map((bg) => ({ fg: tone, bg, min: MARK })),
  ]),
  ...Array.from({ length: 8 }, (_, i) => ({
    fg: `cat-${i + 1}`,
    bg: "background",
    min: MARK,
  })),
]

type Rgba = [number, number, number, number]

function parseHex(value: string): Rgba {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value)
  if (!hex) throw new Error(`Not a hex colour: ${value}`)
  const n = parseInt(hex[1], 16)
  const alpha = hex[2] ? parseInt(hex[2], 16) / 255 : 1
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha]
}

// Follows `var(--x)` references inside the same token set.
export function resolve(
  tokens: TokenSet,
  name: string,
  seen: string[] = []
): string {
  const value = tokens[name]
  if (value === undefined) throw new Error(`Unknown token --${name}`)
  const ref = /^var\(--([\w-]+)\)$/.exec(value)
  if (!ref) return value
  if (seen.includes(name)) throw new Error(`Cycle in --${name}`)
  return resolve(tokens, ref[1], [...seen, name])
}

function over([r, g, b, a]: Rgba, [br, bg, bb]: Rgba): Rgba {
  return [r * a + br * (1 - a), g * a + bg * (1 - a), b * a + bb * (1 - a), 1]
}

function luminance([r, g, b]: Rgba): number {
  const [lr, lg, lb] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb
}

export function ratio(fg: string, bg: string, base = "#ffffff"): number {
  const surface = over(parseHex(bg), parseHex(base))
  const text = over(parseHex(fg), surface)
  const [hi, lo] = [luminance(text), luminance(surface)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

function fade(hex: string, alpha: number): string {
  const a = Math.round(parseHex(hex)[3] * alpha * 255)
  return hex.slice(0, 7) + a.toString(16).padStart(2, "0")
}

export function pairRatio(tokens: TokenSet, pair: Pair): number {
  const base = resolve(tokens, pair.base ?? "background")
  const bg = resolve(tokens, pair.bg)
  const fill = pair.alpha === undefined ? bg : fade(bg, pair.alpha)
  return ratio(resolve(tokens, pair.fg), fill, base)
}
