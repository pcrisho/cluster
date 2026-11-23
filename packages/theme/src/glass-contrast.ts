// Contrast contract of glass surfaces (docs/specs/org/glass/). Pure: nothing here knows the level
// names, so glass.ts can import it. A translucent surface has no fixed colour: what reads on it
// depends on what is behind, so a level is checked against a named backdrop.

import { ratio, resolve, type Theme, type TokenSet } from "./contrast"

// Surfaces the glass pairs sit on, from apps/web/app/globals.css (glass-contrast.spec.ts guards drift).
export const GLASS_BASE: Record<
  Theme,
  {
    popover: string
    foreground: string
    mutedForeground: string
    background: string
  }
> = {
  light: {
    popover: "#ffffff",
    foreground: "#0a0a0a",
    mutedForeground: "#6e6e6e",
    background: "#ffffff",
  },
  dark: {
    popover: "#171717",
    foreground: "#fafafa",
    mutedForeground: "#a1a1a1",
    background: "#0a0a0a",
  },
}

// What may sit behind a surface: pure black (white in dark) is anything, a photo or a video;
// the mid tone is a page of blurred ink on its background.
const BACKDROPS: Record<Theme, { worst: string; mid: string }> = {
  light: { worst: "#000000", mid: "#858585" },
  dark: { worst: "#ffffff", mid: "#828282" },
}

const TEXT = 4.5
const MARK = 3
const STATUS = ["success", "warning", "info", "danger", "neutral"]

export interface GlassCheck {
  fg: string
  // A fill drawn over the surface (a `-subtle` badge); otherwise the text sits on the surface.
  on?: string
  min: number
}

// Text and the focus ring on a glass surface. Status dots are not here: the design system
// never shows a status by colour alone, so a word or an icon always carries it.
export const GLASS_CHECKS: GlassCheck[] = [
  { fg: "foreground", min: TEXT },
  { fg: "popover-foreground", min: TEXT },
  { fg: "glass-muted-foreground", min: TEXT },
  { fg: "destructive", min: TEXT },
  { fg: "ring", min: MARK },
  ...STATUS.flatMap((tone) => [
    { fg: `${tone}-text`, min: TEXT },
    { fg: `${tone}-text`, on: `${tone}-subtle`, min: TEXT },
  ]),
]

const parse = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (rgb: number[]) =>
  "#" + rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")

/** `surface` drawn at `alpha` over `backdrop`, opaque. */
export function surfaceOver(
  surface: string,
  backdrop: string,
  alpha: number
): string {
  const [s, b] = [parse(surface), parse(backdrop)]
  return toHex(s.map((v, i) => v * alpha + b[i] * (1 - alpha)))
}

/** `t` 0 is the worst backdrop, 1 the mid tone. */
export function backdropAt(theme: Theme, t: number): string {
  const { worst, mid } = BACKDROPS[theme]
  return surfaceOver(mid, worst, t)
}

// Smallest opacity, in hundredths from 0.5, for which `ok` holds; 1 when none does.
function firstAlpha(ok: (alpha: number) => boolean): number {
  for (let hundredths = 50; hundredths < 100; hundredths++) {
    if (ok(hundredths / 100)) return hundredths / 100
  }
  return 1
}

/** Lowest surface opacity at which every `GLASS_CHECKS` entry holds over the backdrop at `t`. */
export function requiredAlpha(
  tokens: TokenSet,
  theme: Theme,
  t: number,
  glassMuted: string
): number {
  const all = { ...tokens, "glass-muted-foreground": glassMuted }
  const popover = resolve(all, "popover")
  const backdrop = backdropAt(theme, t)
  return firstAlpha((alpha) => {
    const surface = surfaceOver(popover, backdrop, alpha)
    return GLASS_CHECKS.every(({ fg, on, min }) =>
      on
        ? ratio(resolve(all, fg), resolve(all, on), surface) >= min
        : ratio(resolve(all, fg), surface) >= min
    )
  })
}

/** The same for the brand colour as text, which varies by instance. Its own 10% tint is not covered: see the spec. */
export function primaryAlpha(primary: string, theme: Theme, t: number): number {
  const backdrop = backdropAt(theme, t)
  return firstAlpha((alpha) => {
    const surface = surfaceOver(GLASS_BASE[theme].popover, backdrop, alpha)
    return ratio(primary, surface) >= TEXT
  })
}

/** Largest ambient tint (up to 0.2) under which page text and secondary text keep 4.5:1. */
export function tintCap(primary: string, theme: Theme): number {
  const { background, foreground, mutedForeground } = GLASS_BASE[theme]
  for (let hundredths = 20; hundredths > 0; hundredths--) {
    const page = surfaceOver(background, primary, 1 - hundredths / 100)
    if (
      ratio(foreground, page) >= TEXT &&
      ratio(mutedForeground, page) >= TEXT
    ) {
      return hundredths / 100
    }
  }
  return 0
}
