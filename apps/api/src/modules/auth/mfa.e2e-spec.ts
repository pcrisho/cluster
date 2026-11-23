import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { UserRole } from "@prisma/client";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createTestApp, setCookie, WEB_ORIGIN } from "../../test-helpers";
import { hashPassword } from "./password-hash";
import { MfaService } from "./mfa.service";
import { totpNow } from "./totp";

const PASSWORD = "Second-factor-2026";
const now = () => Math.floor(Date.now() / 1000);

/**
 * Sign-in with a second factor (docs/specs/auth/hardening T19, R-17 to R-21): the password alone gives a
 * challenge, never a session; the code finishes it once; a superadmin without 2FA must enroll first.
 */
describe("Two-step sign-in e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let mfa: MfaService;
  let http: ReturnType<typeof request>;

  async function member(
    name: string,
    opts: { role?: UserRole; superAdmin?: boolean } = {},
  ) {
    const slug = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    const email = `${slug}@x.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD, 4),
        firstName: "Two",
        lastName: "Step",
        role: opts.role ?? "COLLABORATOR",
        isSuperAdmin: !!opts.superAdmin,
        organizationId: org.id,
      },
    });
    return { email, id: user.id, orgId: org.id };
  }

  /** 2FA on, confirmed with the previous step's code, so the current and next codes are still unused. */
  async function withMfa(name: string, opts?: { superAdmin?: boolean }) {
    const m = await member(name, opts);
    const { secret } = await mfa.startEnrollment(m.id, m.email, "Cluster");
    const codes = await mfa.confirmEnrollment(
      m.id,
      totpNow(secret, now() - 30),
    );
    return { ...m, secret, codes: codes! };
  }

  const login = (email: string, password = PASSWORD) =>
    http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .send({ email, password });
  const verify = (body: Record<string, string>) =>
    http.post("/api/v1/auth/mfa/verify").set("Origin", WEB_ORIGIN).send(body);
  const challengeOf = async (email: string) => {
    const res = await login(email).expect(200);
    return res.body.challengeId as string;
  };
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    mfa = app.get(MfaService);
    http = request(app.getHttpServer());
  });
  // Every test signs in several times; the per-route limit is not under test here.
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  it("gives a challenge, not a session, for the password alone; a code finishes it once", async () => {
    const { email, secret } = await withMfa("verify");
    const res = await login(email).expect(200);
    expect(res.body).toEqual({
      mfa: "VERIFY",
      challengeId: expect.any(String),
    });
    expect(res.headers["set-cookie"]).toBeUndefined();

    await verify({ challengeId: res.body.challengeId, code: "000000" })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("MFA_INVALID"));
    const code = totpNow(secret);
    const done = await verify({
      challengeId: res.body.challengeId,
      code,
    }).expect(200);
    expect(done.body.accessToken).toEqual(expect.any(String));
    expect(done.body.user.mfaEnabled).toBe(true);
    expect(setCookie(done, "cluster_session")).toBeDefined();

    // The challenge is spent, and the same code on a new one is a replay.
    await verify({ challengeId: res.body.challengeId, code })
      .expect(410)
      .expect((r) => expect(r.body.code).toBe("CHALLENGE_ENDED"));
    await verify({ challengeId: await challengeOf(email), code })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("MFA_INVALID"));
  });

  it("accepts a recovery code once and records it", async () => {
    const { email, id, codes } = await withMfa("recovery");
    await verify({
      challengeId: await challengeOf(email),
      recoveryCode: codes[0],
    }).expect(200);
    await verify({
      challengeId: await challengeOf(email),
      recoveryCode: codes[0],
    }).expect(400);
    expect(
      await prisma.authEvent.count({
        where: { userId: id, type: "RECOVERY_CODE_USED" },
      }),
    ).toBe(1);
  });

  it("tells the person how many recovery codes are left", async () => {
    const { email, codes } = await withMfa("left");
    const session = await verify({
      challengeId: await challengeOf(email),
      recoveryCode: codes[0],
    }).expect(200);
    expect(session.body.user.recoveryCodesLeft).toBe(9);
    const plain = await member("left-none");
    const res = await login(plain.email).expect(200);
    expect(res.body.user.recoveryCodesLeft).toBeNull();
  });

  it("moves 2FA to a new device with the password and a recovery code, never leaving it off", async () => {
    const { email, id, secret, codes } = await withMfa("move", {
      superAdmin: true,
    });
    const other = await verify({
      challengeId: await challengeOf(email),
      code: totpNow(secret),
    }).expect(200);
    // The phone is gone: in with a recovery code.
    const self = await verify({
      challengeId: await challengeOf(email),
      recoveryCode: codes[0],
    }).expect(200);
    const auth = bearer(self.body.accessToken);
    const start = (body: Record<string, string>) =>
      http.post("/api/v1/auth/mfa/enroll/start").set(auth).send(body);

    await start({ currentPassword: PASSWORD })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("MFA_INVALID"));
    await start({ currentPassword: "Wrong-password-2026", code: codes[1] })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("WRONG_PASSWORD"));
    const started = await start({
      currentPassword: PASSWORD,
      code: codes[1],
    }).expect(200);
    expect(await mfa.isEnabled(id)).toBe(true);

    const confirm = (code: string) =>
      http.post("/api/v1/auth/mfa/enroll/confirm").set(auth).send({ code });
    await confirm("000000").expect(400);
    const done = await confirm(totpNow(started.body.secret, now() - 30)).expect(
      200,
    );
    expect(done.body.recoveryCodes).toHaveLength(10);

    // Other sessions end; the old app and the old recovery codes stop working, the new ones work.
    await http
      .get("/api/v1/auth/me")
      .set(bearer(other.body.accessToken))
      .expect(401);
    await verify({
      challengeId: await challengeOf(email),
      code: totpNow(secret, now() + 30),
    }).expect(400);
    await verify({
      challengeId: await challengeOf(email),
      recoveryCode: codes[2],
    }).expect(400);
    await verify({
      challengeId: await challengeOf(email),
      code: totpNow(started.body.secret),
    }).expect(200);
    expect(
      await prisma.authEvent.count({
        where: { userId: id, type: "MFA_CHANGED" },
      }),
    ).toBe(1);
  });

  it("drops a new device left unconfirmed for too long", async () => {
    const { email, id, secret } = await withMfa("move-late");
    const session = await verify({
      challengeId: await challengeOf(email),
      code: totpNow(secret),
    }).expect(200);
    const auth = bearer(session.body.accessToken);
    const started = await http
      .post("/api/v1/auth/mfa/enroll/start")
      .set(auth)
      .send({ currentPassword: PASSWORD, code: totpNow(secret, now() + 30) })
      .expect(200);
    await prisma.userMfa.update({
      where: { userId: id },
      data: { pendingAt: new Date(Date.now() - 16 * 60_000) },
    });
    await http
      .post("/api/v1/auth/mfa/enroll/confirm")
      .set(auth)
      .send({ code: totpNow(started.body.secret) })
      .expect(400);
  });

  it("ends a challenge after five attempts, or once it expired", async () => {
    const { email, secret } = await withMfa("attempts");
    const challengeId = await challengeOf(email);
    for (let i = 0; i < 5; i++)
      await verify({ challengeId, code: `00000${i}` }).expect(400);
    await verify({ challengeId, code: totpNow(secret) })
      .expect(410)
      .expect((r) => expect(r.body.code).toBe("CHALLENGE_ENDED"));

    const late = await challengeOf(email);
    await prisma.authChallenge.update({
      where: { id: late },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await verify({ challengeId: late, code: totpNow(secret) }).expect(410);
    await verify({ challengeId: "not-a-challenge", code: "123456" }).expect(
      410,
    );
  });

  it("counts wrong codes towards the account lockout", async () => {
    const { email } = await withMfa("lockout");
    for (let round = 0; round < 2; round++) {
      const challengeId = await challengeOf(email);
      for (let i = 0; i < 5; i++)
        await verify({ challengeId, code: `1${round}000${i}` }).expect(400);
    }
    await login(email)
      .expect(429)
      .expect((r) => expect(r.body.code).toBe("ACCOUNT_LOCKED"));
  });

  it("makes a superadmin without 2FA enroll before any session", async () => {
    const { email, id } = await member("enroll", { superAdmin: true });
    const res = await login(email).expect(200);
    expect(res.body).toEqual({
      mfa: "ENROLL",
      challengeId: expect.any(String),
    });
    const { challengeId } = res.body;

    // An enrollment challenge is no verification challenge, and it opens no other door.
    await verify({ challengeId, code: "123456" }).expect(410);
    const started = await http
      .post("/api/v1/auth/mfa/enroll/start")
      .set("Origin", WEB_ORIGIN)
      .send({ challengeId })
      .expect(200);
    expect(started.body.qrSvg).toMatch(/^<svg/);
    await http
      .post("/api/v1/auth/mfa/enroll/confirm")
      .set("Origin", WEB_ORIGIN)
      .send({ challengeId, code: "000000" })
      .expect(400);
    const done = await http
      .post("/api/v1/auth/mfa/enroll/confirm")
      .set("Origin", WEB_ORIGIN)
      .send({ challengeId, code: totpNow(started.body.secret) })
      .expect(200);
    expect(done.body.recoveryCodes).toHaveLength(10);
    expect(setCookie(done, "cluster_session")).toBeDefined();
    const me = await http
      .get("/api/v1/auth/me")
      .set(bearer(done.body.accessToken))
      .expect(200);
    expect(me.body.user).toMatchObject({
      mfaEnabled: true,
      mfaRequired: true,
    });
    expect(
      await prisma.authEvent.count({
        where: { userId: id, type: "MFA_ENABLED" },
      }),
    ).toBe(1);

    // Without a challenge the enrollment routes need a signed-in person.
    await http
      .post("/api/v1/auth/mfa/enroll/start")
      .set("Origin", WEB_ORIGIN)
      .send({})
      .expect(401);
  });

  it("signs in the seeded superadmin with the dev secret documented in AGENTS.md", async () => {
    const res = await login("admin@cluster.example", "Cluster-demo-2026").expect(200);
    expect(res.body.mfa).toBe("VERIFY");
    await verify({
      challengeId: res.body.challengeId,
      code: totpNow("CLUSTERDEMOADMINTOTPSECRETKEY234"),
    }).expect(200);
  });

  it("lets anyone turn 2FA on voluntarily, signing out their other sessions", async () => {
    const { email } = await member("voluntary");
    const other = (await login(email).expect(200)).body.accessToken;
    const self = (await login(email).expect(200)).body.accessToken;

    // A stolen session alone cannot bind someone else's phone to the account.
    await http
      .post("/api/v1/auth/mfa/enroll/start")
      .set(bearer(self))
      .send({})
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("WRONG_PASSWORD"));
    const started = await http
      .post("/api/v1/auth/mfa/enroll/start")
      .set(bearer(self))
      .send({ currentPassword: PASSWORD })
      .expect(200);
    const done = await http
      .post("/api/v1/auth/mfa/enroll/confirm")
      .set(bearer(self))
      .send({ code: totpNow(started.body.secret, now() - 30) })
      .expect(200);
    expect(done.body.recoveryCodes).toHaveLength(10);
    await http.get("/api/v1/auth/me").set(bearer(other)).expect(401);
    const me = await http.get("/api/v1/auth/me").set(bearer(self)).expect(200);
    expect(me.body.user).toMatchObject({
      mfaEnabled: true,
      mfaRequired: false,
    });

    // New recovery codes need a valid code; the old ones stop working.
    await http
      .post("/api/v1/auth/mfa/recovery-codes")
      .set(bearer(self))
      .send({ code: "000000" })
      .expect(400);
    const fresh = await http
      .post("/api/v1/auth/mfa/recovery-codes")
      .set(bearer(self))
      .send({ code: totpNow(started.body.secret) })
      .expect(200);
    expect(fresh.body.recoveryCodes).toHaveLength(10);
    expect((await login(email).expect(200)).body.mfa).toBe("VERIFY");
  });

  it("turns 2FA off with the password and a code, never for a superadmin", async () => {
    const { email, secret } = await withMfa("off");
    const session = await verify({
      challengeId: await challengeOf(email),
      code: totpNow(secret),
    }).expect(200);
    const auth = bearer(session.body.accessToken);
    const off = (body: Record<string, string>) =>
      http.delete("/api/v1/auth/mfa").set(auth).send(body);

    await off({
      currentPassword: "Wrong-password-2026",
      code: totpNow(secret, now() + 30),
    })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("WRONG_PASSWORD"));
    await off({ currentPassword: PASSWORD, code: "000000" })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("MFA_INVALID"));
    await off({
      currentPassword: PASSWORD,
      code: totpNow(secret, now() + 30),
    }).expect(204);
    expect((await login(email).expect(200)).body.accessToken).toEqual(
      expect.any(String),
    );

    const admin = await withMfa("off-super", { superAdmin: true });
    const adminSession = await verify({
      challengeId: await challengeOf(admin.email),
      code: totpNow(admin.secret),
    }).expect(200);
    await http
      .delete("/api/v1/auth/mfa")
      .set(bearer(adminSession.body.accessToken))
      .send({
        currentPassword: PASSWORD,
        code: totpNow(admin.secret, now() + 30),
      })
      .expect(403)
      .expect((r) => expect(r.body.code).toBe("MFA_REQUIRED"));
  });
});
