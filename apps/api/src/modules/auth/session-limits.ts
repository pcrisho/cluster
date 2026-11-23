/**
 * Session lifetimes (docs/specs/auth/hardening, D-03): Google's 14-day web session for people,
 * and close to NIST AAL2 for the superadmin, who can change the whole instance.
 */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const LIMITS = {
  person: { absolute: 14 * DAY, idle: 7 * DAY },
  superAdmin: { absolute: 12 * HOUR, idle: HOUR },
};

/** After a rotation the previous refresh token still rotates for this long: a lost response or two tabs at once. */
export const ROTATION_GRACE_MS = 10_000;

const limitsOf = (superAdmin: boolean) =>
  superAdmin ? LIMITS.superAdmin : LIMITS.person;

export function newExpiry(now: Date, superAdmin: boolean) {
  const limits = limitsOf(superAdmin);
  return {
    absoluteExpiresAt: new Date(now.getTime() + limits.absolute),
    idleExpiresAt: new Date(now.getTime() + limits.idle),
  };
}

/** The idle limit after a use: one idle period from now, never past the total. */
export function extendedIdle(
  now: Date,
  session: { superAdmin: boolean; absoluteExpiresAt: Date },
): Date {
  const idle = now.getTime() + limitsOf(session.superAdmin).idle;
  return new Date(Math.min(idle, session.absoluteExpiresAt.getTime()));
}

interface SessionTimes {
  revokedAt: Date | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}

export function sessionEnded(session: SessionTimes, now: Date): boolean {
  const t = now.getTime();
  return (
    session.revokedAt !== null ||
    t >= session.idleExpiresAt.getTime() ||
    t >= session.absoluteExpiresAt.getTime()
  );
}

/**
 * What a refresh does with a token that matched the session's current or previous hash:
 * rotate it, treat it as stolen (a previous token past the grace window), or refuse an ended session.
 */
export function refreshDecision(
  session: SessionTimes & { rotatedAt: Date | null },
  matched: "current" | "previous",
  now: Date,
): "rotate" | "reuse" | "ended" {
  if (sessionEnded(session, now)) return "ended";
  if (matched === "current") return "rotate";
  const sinceRotation = now.getTime() - (session.rotatedAt?.getTime() ?? 0);
  return sinceRotation <= ROTATION_GRACE_MS ? "rotate" : "reuse";
}
