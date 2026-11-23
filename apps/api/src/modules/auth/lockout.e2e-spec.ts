import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { createHash } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createTestApp, WEB_ORIGIN } from "../../test-helpers";
import { hashPassword } from "./password-hash";

const PASSWORD = "Lockout-password-2026";
const IP_LIMIT = 20;

/**
 * Sign-in lockout (docs/specs/auth/hardening R-25 to R-27): per account from any address, the same answer
 * for an unknown email, and a per-address ceiling that only failures count. Addresses are simulated with
 * X-Forwarded-For on a test app that trusts it.
 */
describe("Sign-in lockout e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  const previous = process.env.AUTH_LOGIN_IP_FAILURES;
  let ipSeq = 0;
  const newIp = () => `198.51.100.${++ipSeq}`;

  async function member(name: string) {
    const slug = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    const email = `${slug}@x.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD, 4),
        firstName: "Lock",
        lastName: "Out",
        organizationId: org.id,
      },
    });
    return { email, id: user.id };
  }
  const login = (email: string, password: string, ip: string) =>
    http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .set("X-Forwarded-For", ip)
      .send({ email, password });
  const failTimes = async (email: string, times: number, ip = newIp()) => {
    for (let i = 0; i < times; i++)
      await login(email, `Wrong-guess-number-${i}`, ip).expect(401);
  };

  beforeAll(async () => {
    process.env.AUTH_LOGIN_IP_FAILURES = String(IP_LIMIT);
    app = await createTestApp();
    app.getHttpAdapter().getInstance().set("trust proxy", true);
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
  });
  // The per-route limit (5/min per address and account) would answer first; it is not under test here.
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    if (previous === undefined) delete process.env.AUTH_LOGIN_IP_FAILURES;
    else process.env.AUTH_LOGIN_IP_FAILURES = previous;
    await app.close();
  });

  it("locks the account after ten failures, for every address and even with the right password", async () => {
    const { email, id } = await member("locked");
    await failTimes(email, 10);
    const res = await login(email, PASSWORD, newIp()).expect(429);
    expect(res.body).toMatchObject({
      code: "ACCOUNT_LOCKED",
      params: { minutes: 1 },
    });
    expect(
      await prisma.authEvent.count({
        where: { userId: id, type: "LOGIN_LOCKED" },
      }),
    ).toBe(1);
  });

  it("answers the same for an email with no account", async () => {
    const email = `nobody-lock-${Date.now()}@x.com`;
    await failTimes(email, 10);
    const res = await login(email, PASSWORD, newIp()).expect(429);
    expect(res.body).toMatchObject({
      code: "ACCOUNT_LOCKED",
      params: { minutes: 1 },
    });
  });

  it("does not count the same wrong password twice", async () => {
    const { email } = await member("typo");
    const ip = newIp();
    for (let i = 0; i < 15; i++)
      await login(email, "Same-typo-again", ip).expect(401);
    await login(email, PASSWORD, ip).expect(200);
  });

  it("starts from zero after a correct sign-in", async () => {
    const { email } = await member("reset");
    await failTimes(email, 9);
    await login(email, PASSWORD, newIp()).expect(200);
    await failTimes(email, 9);
    await login(email, PASSWORD, newIp()).expect(200);
  });

  it("keeps no plain email or password in the counters", async () => {
    const { email } = await member("hashed");
    await login(email, "Visible-secret-here", newIp()).expect(401);
    const row = await prisma.loginThrottle.findUniqueOrThrow({
      where: {
        key: `email:${createHash("sha256").update(email).digest("hex")}`,
      },
    });
    expect(JSON.stringify(row)).not.toContain("Visible-secret-here");
    expect(row.recentWrong).toHaveLength(1);
  });

  it("refuses an address after its ceiling of failures, not another address, and successes do not count", async () => {
    const sprayer = newIp();
    for (let i = 0; i < IP_LIMIT; i++)
      await login(
        `spray-${Date.now()}-${i}@x.com`,
        "Summer-time-2026",
        sprayer,
      ).expect(401);
    const res = await login(
      `spray-next-${Date.now()}@x.com`,
      "Summer-time-2026",
      sprayer,
    ).expect(429);
    expect(res.body.code).toBe("TOO_MANY_REQUESTS");
    await login(
      `spray-other-${Date.now()}@x.com`,
      "Summer-time-2026",
      newIp(),
    ).expect(401);

    const office = newIp();
    const { email } = await member("office");
    for (let i = 0; i < IP_LIMIT + 5; i++)
      await login(email, PASSWORD, office).expect(200);
  });
});
