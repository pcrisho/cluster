// What a theme may choose from. Fonts are self-hosted by the web as `--font-<key>`.

export const FONT_KEYS = [
  "inter",
  "geist",
  "source-sans-3",
  "ibm-plex-sans",
  "dm-sans",
  "nunito-sans",
] as const
export type FontKey = (typeof FONT_KEYS)[number]

export const FONT_LABELS: Record<FontKey, string> = {
  inter: "Inter",
  geist: "Geist",
  "source-sans-3": "Source Sans 3",
  "ibm-plex-sans": "IBM Plex Sans",
  "dm-sans": "DM Sans",
  "nunito-sans": "Nunito Sans",
}

export const RADIUS_KEYS = ["sharp", "default", "round"] as const
export type RadiusKey = (typeof RADIUS_KEYS)[number]

export const RADIUS_REM: Record<RadiusKey, number> = {
  sharp: 0.25,
  default: 0.625,
  round: 1,
}

// Each derives with no adjustment (derive.spec.ts).
export const PRESETS: { name: string; hex: string }[] = [
  { name: "Indigo", hex: "#5e47e8" },
  { name: "Blue", hex: "#1d4ed8" },
  { name: "Teal", hex: "#115e59" },
  { name: "Green", hex: "#166534" },
  { name: "Amber", hex: "#92400e" },
  { name: "Pink", hex: "#be185d" },
  { name: "Slate", hex: "#334155" },
]
