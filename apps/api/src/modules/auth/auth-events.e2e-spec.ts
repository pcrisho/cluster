import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { hashPassword } from "./password-hash";
import { createHash } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import {
  createActor,
  createTestApp,
  setCookie,
  WEB_ORIGIN,
} from "../../test-helpers";
import { ROTATION_GRACE_MS } from "./session-limits";
import { parseRefreshToken } from "./auth-tokens";

const PASSWORD = "Events-password-1";
const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";

/** The set-password token of the newest email to `to`, once it has received `atLeast` emails. */
async function tokenFromMail(to: string, atLeast: number): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length >= atLeast) {
      const msg = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)
      ).json()) as { Text: string };
      return msg.Text.match(/set-password\?token=([\w-]+)/)![1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email for ${to}`);
}
const sha = (v: string) => createHash("sha256").update(v).digest("hex");

/** Authentication events land in auth_events (docs/specs/auth/hardening R-30, R-32). */
describe("Auth events e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;

  async function member(name: string) {
    const slug = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    const user = await prisma.user.create({
      data: {
        email: `${slug}@x.com`,
        passwordHash: await hashPassword(PASSWORD, 4),
        firstName: name,
        lastName: "Events",
        organizationId: org.id,
      },
    });
    return user;
  }
  const login = (email: string, password = PASSWORD) =>
    http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .send({ email, password });
  const eventsOf = (userId: string) =>
    prisma.authEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
  });
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  it("records a sign-in and a failed one, with the session, address and browser", async () => {
    const user = await member("signin");
    await login(user.email, "Wrong-password-1").expect(401);
    const ok = await login(user.email)
      .set("User-Agent", "events-test")
      .expect(200);
    const sid = parseRefreshToken(setCookie(ok, "cluster_session"))!.sid;

    const events = await eventsOf(user.id);
    expect(events.map((e) => e.type)).toEqual(["LOGIN_FAILED", "LOGIN_OK"]);
    expect(events[0].detail).toEqual({ reason: "WRONG_PASSWORD" });
    expect(events[1]).toMatchObject({
      sessionId: sid,
      userAgent: "events-test",
    });
    expect(events[1].ipAddress).toEqual(expect.any(String));
  });

  it("records an attempt on an unknown email by the hash of the address only", async () => {
    const email = `nobody-${Date.now()}@x.com`;
    await login(email).expect(401);
    const [event] = await prisma.authEvent.findMany({
      where: { emailHash: sha(email) },
    });
    expect(event).toMatchObject({
      type: "LOGIN_FAILED",
      userId: null,
      detail: { reason: "NO_ACCOUNT" },
    });
    expect(JSON.stringify(event)).not.toContain(email);
  });

  it("never stores the password", async () => {
    const user = await member("nopassword");
    await login(user.email, "Leaky-secret-123").expect(401);
    const rows = await prisma.authEvent.findMany({
      where: { userId: user.id },
    });
    expect(JSON.stringify(rows)).not.toContain("Leaky-secret-123");
  });

  it("records logout, password change and a stolen refresh token", async () => {
    const user = await member("lifecycle");
    const first = await login(user.email).expect(200);
    const access = first.body.accessToken as string;
    const refresh = setCookie(first, "cluster_session")!;

    const changed = await http
      .patch("/api/v1/auth/me/password")
      .set({ Authorization: `Bearer ${access}` })
      .send({ currentPassword: PASSWORD, newPassword: "Changed-password-1" })
      .expect(200);
    await http
      .post("/api/v1/auth/logout")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", `cluster_session=${setCookie(changed, "cluster_session")}`)
      .expect(204);

    const next = await login(user.email, "Changed-password-1").expect(200);
    const token = setCookie(next, "cluster_session")!;
    await http
      .post("/api/v1/auth/refresh")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", `cluster_session=${token}`)
      .expect(200);
    await prisma.authSession.update({
      where: { id: parseRefreshToken(token)!.sid },
      data: { rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1000) },
    });
    await http
      .post("/api/v1/auth/refresh")
      .set("Origin", WEB_ORIGIN)
      .set("Cookie", `cluster_session=${token}`)
      .expect(401);

    expect((await eventsOf(user.id)).map((e) => e.type)).toEqual([
      "LOGIN_OK",
      "PASSWORD_CHANGED",
      "LOGOUT",
      "LOGIN_OK",
      "REFRESH_REUSE",
    ]);
    expect(refresh).toBeTruthy();
  });

  it("records an accepted invitation and a password reset", async () => {
    const admin = await createActor(app, "ev-admin", "ADMIN");
    const email = `invitee-${Date.now()}@x.com`;
    const { body } = await http
      .post("/api/v1/org/members")
      .set(admin.auth)
      .send({ email, firstName: "In", lastName: "Vitee", role: "COLLABORATOR" })
      .expect(201);
    const setPassword = async (atLeast: number) =>
      http
        .post("/api/v1/auth/set-password")
        .set("Origin", WEB_ORIGIN)
        .send({
          token: await tokenFromMail(email, atLeast),
          password: "Invited-password-1",
        })
        .expect(200);

    await setPassword(1);
    await http.post("/api/v1/auth/forgot-password").send({ email }).expect(204);
    await setPassword(2);

    expect((await eventsOf(body.member.id)).map((e) => e.type)).toEqual([
      "INVITE_ACCEPTED",
      "PASSWORD_RESET",
    ]);
  });

  it("takes the audited address from the connection, not from a forged X-Forwarded-For", async () => {
    const admin = await createActor(app, "ev-ip", "ADMIN");
    await http
      .patch("/api/v1/org")
      .set(admin.auth)
      .set("X-Forwarded-For", "203.0.113.66")
      .send({ name: `Renamed ${Date.now()}` })
      .expect(200);
    const row = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: admin.orgId, action: "Organization.UPDATE" },
      orderBy: { createdAt: "desc" },
    });
    expect(row.ipAddress).not.toBe("203.0.113.66");
  });
});
