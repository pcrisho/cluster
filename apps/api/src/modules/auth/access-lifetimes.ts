/** Lifetimes an ADMIN may choose for a link, in hours (docs/specs/auth/access-without-mail). */
export type AccessPurpose = "INVITE" | "RESET";

export const LIFETIME_PRESETS: Record<AccessPurpose, readonly number[]> = {
  INVITE: [24, 72, 168, 336, 720], // 1, 3, 7, 14, 30 days
  RESET: [1, 24, 72],
};

export const DEFAULT_LIFETIME_HOURS: Record<AccessPurpose, number> = {
  INVITE: 168,
  RESET: 24,
};

export const isValidLifetime = (purpose: AccessPurpose, hours: unknown): boolean =>
  typeof hours === "number" && LIFETIME_PRESETS[purpose].includes(hours);

export const lifetimeSeconds = (hours: number): number => hours * 3600;
