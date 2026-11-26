// Glass: how translucent menus and modals are (docs/specs/org/glass/). An instance chooses a level;
// Off is `null`. It is instance-only, so it is not part of `Seeds`.

import { primaryAlpha, tintCap } from "./glass-contrast"

export const GLASS_KEYS = ["subtle", "medium", "strong"] as const
export type GlassKey = (typeof GLASS_KEYS)[number]

export interface GlassLevel {
  /** Surface opacity, 0..1. */
  alpha: number
  /** Backdrop blur, px. */
  blur: number
  /** Backdrop saturation, %. */
  saturate: number
  /** Opacity of the primary-colour tint of the ambient background, 0..1. */
  tint: number
}

// Backdrop each level is checked against (glass-contrast.ts): 0 is the worst (black or white),
// 1 a mid tone. More glass leans more on what is behind, so its guarantee is a milder backdrop.
export const GLASS_BACKDROP_T: Record<GlassKey, number> = {
  subtle: 0,
  medium: 0.5,
  strong: 1,
}

// `alpha` is the lowest the contract allows for the default brand (glass-contrast.spec.ts).
export const GLASS_LEVELS: Record<
  GlassKey,
  { light: GlassLevel; dark: GlassLevel }
> = {
  subtle: {
    light: { alpha: 0.92, blur: 8, saturate: 120, tint: 0.03 },
    dark: { alpha: 0.92, blur: 8, saturate: 120, tint: 0.06 },
  },
  medium: {
    light: { alpha: 0.9, blur: 16, saturate: 140, tint: 0.05 },
    dark: { alpha: 0.89, blur: 16, saturate: 140, tint: 0.09 },
  },
  strong: {
    light: { alpha: 0.84, blur: 24, saturate: 160, tint: 0.07 },
    dark: { alpha: 0.82, blur: 24, saturate: 160, tint: 0.12 },
  },
}

/** `muted-foreground` inside glass surfaces: darker in light, lighter in dark. */
export const GLASS_TEXT_TOKENS = { light: "#525252", dark: "#c4c4c4" } as const

// Strict reader for untrusted input: anything but a level is Off, so nothing hostile reaches CSS.
export function parseGlass(value: unknown): GlassKey | null {
  return GLASS_KEYS.find((key) => key === value) ?? null
}

/** The level for a theme, made more opaque or less tinted when the brand colour needs it. */
export function glassLevel(
  key: GlassKey,
  theme: "light" | "dark",
  primary?: string | null
): GlassLevel {
  const level = GLASS_LEVELS[key][theme]
  if (!primary) return level
  const needed = primaryAlpha(primary, theme, GLASS_BACKDROP_T[key])
  return {
    ...level,
    alpha: Math.max(level.alpha, needed < 1 ? needed : level.alpha),
    tint: Math.min(level.tint, tintCap(primary, theme)),
  }
}

const block = (selector: string, level: GlassLevel, text: string) =>
  `${selector}{--glass-alpha:${level.alpha};--glass-blur:${level.blur}px;` +
  `--glass-saturate:${level.saturate}%;--glass-tint:${level.tint};` +
  `--glass-muted-foreground:${text};}`

/**
 * Variables of a level, light then dark like `themeCss`; "" is Off (no change to the page).
 * `primaries` are the brand colours in use (resolved and derived), so the level keeps the contract with them.
 */
export function glassCss(
  key: GlassKey | null,
  primaries?: { light: string; dark: string } | null
): string {
  if (!key) return ""
  return (
    block(
      "html:root",
      glassLevel(key, "light", primaries?.light),
      GLASS_TEXT_TOKENS.light
    ) +
    block(
      "html.dark",
      glassLevel(key, "dark", primaries?.dark),
      GLASS_TEXT_TOKENS.dark
    )
  )
}
