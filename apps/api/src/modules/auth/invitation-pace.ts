const DEFAULT_PER_MINUTE = 60;

/** MAIL_INVITES_PER_MINUTE: a whole number; unset or not one means the default, 0 pauses the sender. */
export function parsePerMinute(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PER_MINUTE;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_PER_MINUTE;
}

/** Time between two invitations: 60 000 ms divided by the rate. Only called with a rate above 0. */
export const paceIntervalMs = (perMinute: number): number => Math.ceil(60_000 / perMinute);
