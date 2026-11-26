import { FONT_KEYS, RADIUS_KEYS, type FontKey, type RadiusKey } from "./catalog"

// One layer of the theme (instance or organization); `null` = inherit.
export interface Seeds {
  brandPrimary: string | null
  brandSecondary: string | null
  fontKey: FontKey | null
  radiusKey: RadiusKey | null
}

export const EMPTY_SEEDS: Seeds = {
  brandPrimary: null,
  brandSecondary: null,
  fontKey: null,
  radiusKey: null,
}

export function normalizeHex(input: string): string | null {
  const hex = /^#?([0-9a-f]{6})$/i.exec(input.trim())
  return hex ? `#${hex[1].toLowerCase()}` : null
}

const hexOf = (value: unknown) =>
  typeof value === "string" ? normalizeHex(value) : null

const oneOf = <T extends string>(keys: readonly T[], value: unknown) =>
  keys.find((key) => key === value) ?? null

// Strict reader for untrusted input (cookie, API payload): the result is safe to put in CSS.
export function parseSeeds(input: unknown): Seeds | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return null
  }
  const raw = input as Record<string, unknown>
  const brandPrimary = hexOf(raw.brandPrimary)
  return {
    brandPrimary,
    brandSecondary: brandPrimary ? hexOf(raw.brandSecondary) : null,
    fontKey: oneOf(FONT_KEYS, raw.fontKey),
    radiusKey: oneOf(RADIUS_KEYS, raw.radiusKey),
  }
}
