import {
  BASE,
  DERIVED_TOKENS,
  GLASS_TEXT_TOKENS,
  PAIRS,
  RADIUS_REM,
  deriveTheme,
  glassLevel,
  normalizeHex,
  pairRatio,
  type GlassKey,
  type Pair,
  type Seeds,
  type Theme,
  type TokenSet,
} from "@cluster/theme"

// What the Appearance form sends: "" is "not set", hex lowercase, no secondary without a primary.
export function toPayload(form: Seeds): Seeds {
  const hex = (value: string | null) => (value ? normalizeHex(value) : null)
  const brandPrimary = hex(form.brandPrimary)
  return {
    brandPrimary,
    brandSecondary: brandPrimary ? hex(form.brandSecondary) : null,
    fontKey: form.fontKey,
    radiusKey: form.radiusKey,
  }
}

// A half-typed hex counts as a change (Save stays disabled until it is valid).
const comparable = (value: string | null) =>
  value ? (normalizeHex(value) ?? value) : null

export function isDirty(saved: Seeds, form: Seeds): boolean {
  return (Object.keys(saved) as (keyof Seeds)[]).some(
    (key) => comparable(saved[key]) !== comparable(form[key])
  )
}

// Neutrals the preview card reads, so the light card stays light in a dark app and the
// reverse (appearance-form.spec.ts checks them against globals.css).
const NEUTRALS: Record<Theme, TokenSet> = {
  light: {
    foreground: "#0a0a0a",
    "card-foreground": "#0a0a0a",
    popover: "#ffffff",
    "popover-foreground": "#0a0a0a",
    "muted-foreground": "#6e6e6e",
    accent: "#f5f5f5",
    "accent-foreground": "#171717",
    border: "#e5e5e5",
    input: "#e5e5e5",
    ring: "#737373",
  },
  dark: {
    foreground: "#fafafa",
    "card-foreground": "#fafafa",
    popover: "#171717",
    "popover-foreground": "#fafafa",
    "muted-foreground": "#a1a1a1",
    accent: "#262626",
    "accent-foreground": "#fafafa",
    border: "#ffffff1a",
    input: "#ffffff26",
    ring: "#737373",
  },
}

export function tokensFor(seeds: Seeds, theme: Theme): TokenSet {
  const derived = seeds.brandPrimary
    ? deriveTheme({
        primary: seeds.brandPrimary,
        secondary: seeds.brandSecondary,
      })[theme]
    : {}
  return { ...BASE[theme], ...derived }
}

// CSS variables set inline on one preview card: only that card changes, never the app.
export function previewVars(
  seeds: Seeds,
  theme: Theme
): Record<string, string> {
  const tokens = { ...NEUTRALS[theme], ...tokensFor(seeds, theme) }
  return {
    ...Object.fromEntries(
      Object.entries(tokens).map(([name, value]) => [`--${name}`, value])
    ),
    "--radius": `${RADIUS_REM[seeds.radiusKey ?? "default"]}rem`,
  }
}

/**
 * Glass variables of one preview card: Off is the solid look; a level follows the same table, and
 * the same adjustment to the brand colour, as the app does (`glassCss` in @cluster/theme).
 */
export function glassPreviewVars(
  glass: GlassKey | null,
  seeds: Seeds,
  theme: Theme
): Record<string, string> {
  if (!glass) {
    return {
      "--glass-alpha": "1",
      "--glass-filter": "none",
      "--glass-tint": "0",
    }
  }
  const level = glassLevel(glass, theme, tokensFor(seeds, theme).primary)
  return {
    "--glass-alpha": String(level.alpha),
    "--glass-filter": `blur(${level.blur}px) saturate(${level.saturate}%)`,
    "--glass-tint": String(level.tint),
    "--muted-foreground": GLASS_TEXT_TOKENS[theme],
  }
}

/** `saved` is undefined where the glass level is not shown (an organization): never dirty there. */
export const isGlassDirty = (
  saved: GlassKey | null | undefined,
  form: GlassKey | null
) => saved !== undefined && saved !== form

const AFFECTED = PAIRS.filter((pair) =>
  [pair.fg, pair.bg].some((token) => DERIVED_TOKENS.includes(token))
)

export function contrastRows(
  seeds: Seeds,
  theme: Theme
): (Pair & { ratio: number; pass: boolean })[] {
  const tokens = tokensFor(seeds, theme)
  return AFFECTED.map((pair) => {
    const ratio = pairRatio(tokens, pair)
    return { ...pair, ratio, pass: ratio >= pair.min }
  })
}
