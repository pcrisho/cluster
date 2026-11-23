import { INestApplication } from "@nestjs/common";
import { randomUUID } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createTestApp } from "../../test-helpers";
import { sweepAuth } from "./auth-sweep";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Auth sweep (issue #15): stale rows go, rows that still count stay, a dry run deletes nothing. */
describe("Auth sweep e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  const ago = (ms: number) => new Date(Date.now() - ms);
  const ahead = (ms: number) => new Date(Date.now() + ms);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
  });
  afterAll(() => app.close());

  async function user() {
    const slug = `sweep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    return prisma.user.create({
      data: {
        email: `${slug}@x.com`,
        passwordHash: "x",
        firstName: "Sweep",
        lastName: "Test",
        organizationId: org.id,
      },
    });
  }
  const session = (
    userId: string,
    absoluteExpiresAt: Date,
    revokedAt: Date | null = null,
  ) =>
    prisma.authSession.create({
      data: {
        userId,
        refreshHash: randomUUID(),
        superAdmin: false,
        idleExpiresAt: absoluteExpiresAt,
        absoluteExpiresAt,
        revokedAt,
      },
    });
  const throttle = (
    data: Partial<{
      windowStart: Date;
      lockedUntil: Date;
      lastLockAt: Date;
      lockLevel: number;
      failures: number;
    }>,
  ) => prisma.loginThrottle.create({ data: { key: randomUUID(), ...data } });

  async function seed() {
    const u1 = await user();
    const u2 = await user();
    const u3 = await user();
    const u4 = await user();
    const rows = {
      sessions: {
        live: await session(u1.id, ahead(DAY)),
        expired: await session(u2.id, ago(HOUR)),
        revokedExpired: await session(u3.id, ago(HOUR), ago(2 * HOUR)),
        revokedLive: await session(u4.id, ahead(DAY), ago(HOUR)),
      },
      challenges: {
        live: await prisma.authChallenge.create({
          data: { userId: u1.id, purpose: "VERIFY", expiresAt: ahead(MIN) },
        }),
        expired: await prisma.authChallenge.create({
          data: { userId: u2.id, purpose: "VERIFY", expiresAt: ago(MIN) },
        }),
        used: await prisma.authChallenge.create({
          data: {
            userId: u3.id,
            purpose: "VERIFY",
            expiresAt: ahead(MIN),
            usedAt: new Date(),
          },
        }),
      },
      links: {
        live: await prisma.passwordLink.create({
          data: {
            tokenHash: randomUUID(),
            userId: u1.id,
            purpose: "RESET",
            expiresAt: ahead(HOUR),
          },
        }),
        expired: await prisma.passwordLink.create({
          data: {
            tokenHash: randomUUID(),
            userId: u2.id,
            purpose: "RESET",
            expiresAt: ago(HOUR),
          },
        }),
      },
      throttle: {
        counting: await throttle({ windowStart: ago(MIN), failures: 3 }),
        locked: await throttle({
          windowStart: ago(20 * MIN),
          lockedUntil: ahead(MIN),
        }),
        // window and lock are over, but the lock level has not decayed yet: the next lock still doubles
        level: await throttle({
          windowStart: ago(2 * HOUR),
          lockedUntil: ago(HOUR),
          lastLockAt: ago(HOUR),
          lockLevel: 2,
        }),
        stale: await throttle({ windowStart: ago(2 * HOUR), failures: 1 }),
        staleLocked: await throttle({
          windowStart: ago(3 * DAY),
          lockedUntil: ago(3 * DAY),
          lastLockAt: ago(3 * DAY),
          lockLevel: 2,
        }),
      },
      events: {
        recent: await prisma.authEvent.create({
          data: { type: "LOGIN", userId: u1.id, createdAt: ago(10 * DAY) },
        }),
        old: await prisma.authEvent.create({
          data: { type: "LOGIN", userId: u1.id, createdAt: ago(400 * DAY) },
        }),
      },
    };
    return rows;
  }

  const ids = (
    o: Record<string, { id?: string; key?: string; tokenHash?: string }>,
  ) => Object.values(o).map((r) => r.id ?? r.key ?? r.tokenHash!);
  const exists = async (rows: Awaited<ReturnType<typeof seed>>) => ({
    sessions: new Set(
      (
        await prisma.authSession.findMany({
          where: { id: { in: ids(rows.sessions) } },
        })
      ).map((r) => r.id),
    ),
    challenges: new Set(
      (
        await prisma.authChallenge.findMany({
          where: { id: { in: ids(rows.challenges) } },
        })
      ).map((r) => r.id),
    ),
    links: new Set(
      (
        await prisma.passwordLink.findMany({
          where: { tokenHash: { in: ids(rows.links) } },
        })
      ).map((r) => r.tokenHash),
    ),
    throttle: new Set(
      (
        await prisma.loginThrottle.findMany({
          where: { key: { in: ids(rows.throttle) } },
        })
      ).map((r) => r.key),
    ),
    events: new Set(
      (
        await prisma.authEvent.findMany({
          where: { id: { in: ids(rows.events) } },
        })
      ).map((r) => r.id),
    ),
  });

  it("a dry run counts the stale rows and deletes nothing", async () => {
    const rows = await seed();
    const counts = await sweepAuth(prisma, { apply: false });
    // other specs may leave stale rows too: at least ours
    expect(counts.sessions).toBeGreaterThanOrEqual(2);
    expect(counts.challenges).toBeGreaterThanOrEqual(2);
    expect(counts.links).toBeGreaterThanOrEqual(1);
    expect(counts.throttle).toBeGreaterThanOrEqual(2);
    expect(counts.events).toBeGreaterThanOrEqual(1);
    const left = await exists(rows);
    expect(left.sessions.size).toBe(4);
    expect(left.challenges.size).toBe(3);
    expect(left.links.size).toBe(2);
    expect(left.throttle.size).toBe(5);
    expect(left.events.size).toBe(2);
  });

  it("--apply removes the stale rows and keeps every row that still counts", async () => {
    const rows = await seed();
    await sweepAuth(prisma, { apply: true });
    const left = await exists(rows);
    expect(left.sessions).toEqual(
      new Set([rows.sessions.live.id, rows.sessions.revokedLive.id]),
    );
    expect(left.challenges).toEqual(new Set([rows.challenges.live.id]));
    expect(left.links).toEqual(new Set([rows.links.live.tokenHash]));
    expect(left.throttle).toEqual(
      new Set([
        rows.throttle.counting.key,
        rows.throttle.locked.key,
        rows.throttle.level.key,
      ]),
    );
    expect(left.events).toEqual(new Set([rows.events.recent.id]));
  });

  it("the event retention is a parameter", async () => {
    const rows = await seed();
    await sweepAuth(prisma, { apply: true, eventsRetentionDays: 5 });
    expect((await exists(rows)).events.size).toBe(0);
  });
});
