import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, WEB_ORIGIN } from "../../test-helpers";
import { hashPassword } from "./password-hash";
import { MfaService } from "./mfa.service";
import { totpNow } from "./totp";

const PASSWORD = "Security-notice-2026";
const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";
const now = () => Math.floor(Date.now() / 1000);

type Mail = { Subject: string; Text: string; HTML: string };

/** The newest email to `to` whose subject matches, waiting for it to arrive. */
async function mailTo(to: string, subject: RegExp): Promise<Mail> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await res.json()) as {
      messages: { ID: string; Subject: string }[];
    };
    const found = messages.find((m) => subject.test(m.Subject));
    if (found)
      return (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${found.ID}`)
      ).json()) as Mail;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

/** A notice says what happened and from where, and carries no link to act on (R-31). */
function expectNotice(mail: Mail, ip: string) {
  expect(mail.Text).toContain(ip);
  expect(mail.Text).not.toMatch(/https?:\/\//);
  expect(mail.HTML).not.toMatch(/<a\s/i);
}

/** Security notices by email (docs/specs/auth/hardening T22, R-31), in the person's language. */
describe("Security notices e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let mfa: MfaService;
  let http: ReturnType<typeof request>;
  let ipSeq = 0;
  const newIp = () => `203.0.113.${++ipSeq}`;

  async function member(name: string, locale: "en" | "es") {
    const slug = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    const email = `${slug}@x.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD, 4),
        firstName: "Notice",
        lastName: "Person",
        locale,
        organizationId: org.id,
      },
    });
    return { email, id: user.id, orgId: org.id };
  }
  const signIn = async (email: string, ip: string) => {
    const res = await http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .set("X-Forwarded-For", ip)
      .send({ email, password: PASSWORD })
      .expect(200);
    return res.body;
  };

  beforeAll(async () => {
    app = await createTestApp();
    app.getHttpAdapter().getInstance().set("trust proxy", true);
    prisma = app.get(SystemPrismaService);
    mfa = app.get(MfaService);
    http = request(app.getHttpServer());
  });
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  it("tells of a changed password, in English", async () => {
    const { email } = await member("changed-en", "en");
    const ip = newIp();
    const { accessToken } = await signIn(email, ip);
    await http
      .patch("/api/v1/auth/me/password")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("X-Forwarded-For", ip)
      .send({ currentPassword: PASSWORD, newPassword: "Different-phrase-2026" })
      .expect(200);
    expectNotice(await mailTo(email, /password was changed/), ip);
  });

  it("tells of a password reset through a link, in Spanish", async () => {
    const { email } = await member("reset-es", "es");
    await http.post("/api/v1/auth/forgot-password").send({ email }).expect(204);
    const link = await mailTo(email, /Restablece/);
    const token = link.Text.match(/set-password\?token=([\w-]+)/)![1];
    const ip = newIp();
    await http
      .post("/api/v1/auth/set-password")
      .set("Origin", WEB_ORIGIN)
      .set("X-Forwarded-For", ip)
      .send({ token, password: "Different-phrase-2026" })
      .expect(200);
    expectNotice(
      await mailTo(email, /contraseña de Cluster se restableció/),
      ip,
    );
  });

  it("tells of 2FA turned on, a recovery code used and 2FA turned off, in Spanish", async () => {
    const { email } = await member("mfa-es", "es");
    const ip = newIp();
    const auth = {
      Authorization: `Bearer ${(await signIn(email, ip)).accessToken}`,
    };
    const { secret } = (
      await http
        .post("/api/v1/auth/mfa/enroll/start")
        .set(auth)
        .send({ currentPassword: PASSWORD })
        .expect(200)
    ).body;
    const { recoveryCodes } = (
      await http
        .post("/api/v1/auth/mfa/enroll/confirm")
        .set(auth)
        .set("X-Forwarded-For", ip)
        .send({ code: totpNow(secret, now() - 30) })
        .expect(200)
    ).body;
    expectNotice(await mailTo(email, /^Activaste la verificación/), ip);

    const { challengeId } = await signIn(email, ip);
    const session = await http
      .post("/api/v1/auth/mfa/verify")
      .set("Origin", WEB_ORIGIN)
      .set("X-Forwarded-For", ip)
      .send({ challengeId, recoveryCode: recoveryCodes[0] })
      .expect(200);
    expectNotice(await mailTo(email, /código de recuperación/), ip);

    await http
      .delete("/api/v1/auth/mfa")
      .set("Authorization", `Bearer ${session.body.accessToken}`)
      .set("X-Forwarded-For", ip)
      .send({ currentPassword: PASSWORD, code: totpNow(secret) })
      .expect(204);
    expectNotice(await mailTo(email, /^Desactivaste la verificación/), ip);
  });

  it("sends a member whose 2FA an ADMIN reset a link to set a new password", async () => {
    const owner = await createActor(app, "notice-owner", "ADMIN");
    const target = await member("reset-mfa-en", "en");
    await prisma.user.update({
      where: { id: target.id },
      data: { organizationId: owner.orgId },
    });
    const { secret } = await mfa.startEnrollment(target.id, "x", "Cluster");
    await mfa.confirmEnrollment(target.id, totpNow(secret));
    const ip = newIp();
    await http
      .delete(`/api/v1/org/members/${target.id}/mfa`)
      .set(owner.auth)
      .set("X-Forwarded-For", ip)
      .expect(204);
    const mail = await mailTo(target.email, /administrator reset/);
    const token = /set-password\?token=([\w-]+)/.exec(mail.Text)?.[1];
    expect(token).toBeDefined();
    const res = await http
      .post("/api/v1/auth/set-password")
      .set("Origin", WEB_ORIGIN)
      .send({ token, password: "Brand-new-phrase-2026" })
      .expect(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });
});
