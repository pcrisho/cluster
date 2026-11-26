import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { hashPassword, UNUSABLE_PASSWORD } from "./password-hash";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createTestApp } from "../../test-helpers";

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";

const median = (values: number[]) =>
  [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** How long a request takes, in ms. */
async function timed(send: () => Promise<unknown>) {
  const start = performance.now();
  await send();
  return performance.now() - start;
}

/**
 * Whether an account exists must not show in how long sign-in or a reset request takes
 * (docs/specs/auth/hardening R-28, R-29). Medians of alternating runs, compared with each other.
 */
describe("Uniform response times e2e", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let email: string;
  let pendingEmail: string;
  let expiredEmail: string;

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    const prisma = app.get(SystemPrismaService);
    const slug = `timing-${Date.now()}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    email = `${slug}@x.com`;
    await prisma.user.create({
      // The production cost, so the comparison with the dummy hash is a fair one.
      data: {
        email,
        passwordHash: await hashPassword("Timing-password-1", 12),
        firstName: "Timing",
        lastName: "Test",
        organizationId: org.id,
      },
    });
    // Invitation pending: the marker, no bcrypt hash (docs/specs/auth/access-without-mail).
    pendingEmail = `${slug}-pending@x.com`;
    await prisma.user.create({
      data: {
        email: pendingEmail,
        passwordHash: UNUSABLE_PASSWORD,
        firstName: "Timing",
        lastName: "Pending",
        organizationId: org.id,
      },
    });
    // An initial password whose time ran out.
    expiredEmail = `${slug}-expired@x.com`;
    await prisma.user.create({
      data: {
        email: expiredEmail,
        passwordHash: await hashPassword("Initial-password-1", 12),
        tempPasswordExpiresAt: new Date(Date.now() - 60_000),
        firstName: "Timing",
        lastName: "Expired",
        organizationId: org.id,
      },
    });
  });
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  it("signs in no faster for an unknown email than for a wrong password", async () => {
    const login = (address: string) => () =>
      http
        .post("/api/v1/auth/login")
        .send({ email: address, password: "Wrong-password-1" })
        .expect(401);
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 5; i++) {
      known.push(await timed(login(email)));
      unknown.push(await timed(login(`nobody-${Date.now()}-${i}@x.com`)));
    }
    const ratio = median(unknown) / median(known);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it("signs a pending account in no faster than an unknown email", async () => {
    const login = (address: string) => () =>
      http
        .post("/api/v1/auth/login")
        .send({ email: address, password: "Wrong-password-1" })
        .expect(401);
    const pending: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 5; i++) {
      pending.push(await timed(login(pendingEmail)));
      unknown.push(await timed(login(`nobody-${Date.now()}-${i}@x.com`)));
    }
    const ratio = median(pending) / median(unknown);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it("answers an expired initial password like a wrong one, in the same time", async () => {
    const login = (password: string) => () =>
      http
        .post("/api/v1/auth/login")
        .send({ email: expiredEmail, password })
        .expect(401)
        .expect((res) => expect(res.body.code).toBe("INVALID_CREDENTIALS"));
    const expired: number[] = [];
    const wrong: number[] = [];
    // Eight failures: under the account's lockout threshold (10).
    for (let i = 0; i < 4; i++) {
      expired.push(await timed(login("Initial-password-1")));
      wrong.push(await timed(login("Wrong-password-1")));
    }
    const ratio = median(expired) / median(wrong);
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.2);
  });

  it("answers a reset request before sending the email, account or not", async () => {
    const forgot = (address: string) => () =>
      http
        .post("/api/v1/auth/forgot-password")
        .send({ email: address })
        .expect(204);
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 5; i++) {
      known.push(await timed(forgot(email)));
      unknown.push(await timed(forgot(`nobody-${Date.now()}-${i}@x.com`)));
    }
    // Both are one indexed lookup; sending the email no longer adds to the known case.
    expect(Math.abs(median(known) - median(unknown))).toBeLessThan(25);

    // The email still goes out.
    let found = 0;
    for (let i = 0; i < 40 && found === 0; i++) {
      const res = await fetch(
        `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
      );
      found = ((await res.json()) as { messages: unknown[] }).messages.length;
      if (!found) await new Promise((r) => setTimeout(r, 250));
    }
    expect(found).toBeGreaterThan(0);
  });
});
