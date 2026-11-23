import type { PrismaClient } from "@prisma/client";
import { LOCKOUT } from "./lockout";

const DAY_MS = 24 * 60 * 60_000;
export const DEFAULT_EVENTS_RETENTION_DAYS = 365;

export type SweepCounts = Record<
  "sessions" | "challenges" | "links" | "throttle" | "events",
  number
>;

/**
 * Deletes (or, without `apply`, counts) the auth rows nothing needs any more (issue #15). A
 * `login_throttle` row goes only when its window is over, its lock is over and its lock level has
 * decayed, so it neither blocks nor counts. Sessions are dead past their absolute expiry, revoked or not.
 */
export async function sweepAuth(
  prisma: Pick<
    PrismaClient,
    | "authSession"
    | "authChallenge"
    | "passwordLink"
    | "loginThrottle"
    | "authEvent"
  >,
  options: { apply: boolean; eventsRetentionDays?: number; now?: Date },
): Promise<SweepCounts> {
  const now = options.now ?? new Date();
  const t = now.getTime();
  const retention =
    options.eventsRetentionDays ?? DEFAULT_EVENTS_RETENTION_DAYS;
  const run = (
    table: {
      count: (a: { where: object }) => Promise<number>;
      deleteMany: (a: { where: object }) => Promise<{ count: number }>;
    },
    where: object,
  ) =>
    options.apply
      ? table.deleteMany({ where }).then((r) => r.count)
      : table.count({ where });
  return {
    sessions: await run(prisma.authSession, {
      absoluteExpiresAt: { lt: now },
    }),
    challenges: await run(prisma.authChallenge, {
      OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }],
    }),
    links: await run(prisma.passwordLink, { expiresAt: { lt: now } }),
    throttle: await run(prisma.loginThrottle, {
      windowStart: { lt: new Date(t - LOCKOUT.windowMs) },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
      AND: [
        {
          OR: [
            { lastLockAt: null },
            { lastLockAt: { lt: new Date(t - LOCKOUT.levelDecayMs) } },
          ],
        },
      ],
    }),
    events: await run(prisma.authEvent, {
      createdAt: { lt: new Date(t - retention * DAY_MS) },
    }),
  };
}
