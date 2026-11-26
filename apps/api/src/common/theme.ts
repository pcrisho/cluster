import { BadRequestException } from "@nestjs/common";
import {
  deriveTheme,
  hexToOklch,
  normalizeHex,
  oklchToHex,
  parseSeeds,
  ratio,
  resolveSeeds,
  EMPTY_SEEDS,
  type Seeds,
} from "@cluster/theme";
import type { ThemeDto } from "./theme.dto";

type SeedRow = {
  brandPrimary: string | null;
  brandSecondary: string | null;
  fontKey: string | null;
  radiusKey: string | null;
};

/** The seeds stored on an instance or organization row, through the strict reader. */
export const seedsOf = (row: SeedRow): Seeds => parseSeeds(row) ?? EMPTY_SEEDS;

/** The brand colour for print (a certificate): readable on white paper (≥ 4.5:1); `null` = no brand colour. */
export const accentOf = (seeds: Seeds): string | null => {
  if (seeds.brandPrimary === null) return null
  const primary = deriveTheme({
    primary: seeds.brandPrimary,
    secondary: seeds.brandSecondary,
  }).light["primary"]
  if (ratio(primary, "#ffffff") >= 4.5) return primary
  const seed = hexToOklch(primary)
  let fail = seed.l
  let pass = 0
  for (let step = 0; step < 24; step++) {
    const mid = (fail + pass) / 2
    if (ratio(oklchToHex({ ...seed, l: mid }), "#ffffff") >= 4.5) pass = mid
    else fail = mid
  }
  return oklchToHex({ ...seed, l: pass })
}

/** An organization theme applies only when the instance allows it and the superadmin left it on for this organization. */
export const canCustomize = (
  settings: { orgThemingAllowed: boolean },
  org: { themingEnabled: boolean },
): boolean => settings.orgThemingAllowed && org.themingEnabled;

/** What an organization's people see: the instance seeds, with the organization's on top only while both switches are on. */
export const effectiveSeeds = (
  settings: SeedRow & { orgThemingAllowed: boolean },
  org: SeedRow & { themingEnabled: boolean },
): Seeds =>
  resolveSeeds(
    seedsOf(settings),
    canCustomize(settings, org) ? seedsOf(org) : null,
  );

const invalidColor = (message: string) =>
  new BadRequestException({ code: "INVALID_COLOR", message });

/** Columns to write for a theme payload: colours normalised, `null` = reset; `current` is what is stored now. */
export function themeData(dto: ThemeDto, current: Seeds): Partial<Seeds> {
  const data: Partial<Seeds> = {};
  for (const key of ["brandPrimary", "brandSecondary"] as const) {
    const value = dto[key];
    if (value === undefined) continue;
    if (value === null) {
      data[key] = null;
      continue;
    }
    const hex = normalizeHex(value);
    if (!hex) throw invalidColor("Use a colour like #4c33e1");
    data[key] = hex;
  }
  if (dto.fontKey !== undefined) data.fontKey = dto.fontKey;
  if (dto.radiusKey !== undefined) data.radiusKey = dto.radiusKey;
  const primary =
    "brandPrimary" in data ? data.brandPrimary : current.brandPrimary;
  if (!primary) {
    if (data.brandSecondary) throw invalidColor("Set a primary colour first");
    data.brandSecondary = null; // colours are one block: no primary, no secondary
  }
  return data;
}
