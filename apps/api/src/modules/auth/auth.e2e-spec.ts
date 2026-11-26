import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { hashPassword } from "./password-hash";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import {
  createActor,
  createTestApp,
  setCookie,
  WEB_ORIGIN,
} from "../../test-helpers";
import { parseRefreshToken } from "./auth-tokens";
import { ROTATION_GRACE_MS } from "./session-limits";

const PASSWORD = "Session1234";

/** What the browser holds after signing in: the access token in memory, the other two in cookies. */
type Session = {
  accessToken: string;
  refreshToken: string;
  fileCookie: string;
};

describe("Auth sessions e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;

  /** A fresh member with a real password, so every test signs in for itself. */
  async function member(name: string) {
    const slug = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    const email = `${slug}@x.com`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD, 4),
        firstName: name,
        lastName: "Test",
        role: "COLLABORATOR",
        organizationId: org.id,
      },
    });
    return email;
  }

  const sessionFrom = (res: request.Response): Session => ({
    accessToken: res.body.accessToken,
    refreshToken: setCookie(res, "cluster_session")!,
    fileCookie: `cluster_files=${setCookie(res, "cluster_files")}`,
  });
  const login = async (email: string, password = PASSWORD) =>
    sessionFrom(
      await http
        .post("/api/v1/auth/login")
        .set("Origin", WEB_ORIGIN)
        .send({ email, password })
        .expect(200),
    );
  const refresh = (
    refreshToken: string,
    origin: string | null = WEB_ORIGIN,
  ) => {
    const req = http
      .post("/api/v1/auth/refresh")
      .set("Cookie", `cluster_session=${refreshToken}`);
    return origin ? req.set("Origin", origin) : req;
  };
  const refreshed = async (refreshToken: string) =>
    sessionFrom(await refresh(refreshToken).expect(200));
  const logout = (s?: Session) => {
    const req = http.post("/api/v1/auth/logout").set("Origin", WEB_ORIGIN);
    return s ? req.set("Cookie", `cluster_session=${s.refreshToken}`) : req;
  };
  const me = (s: Session) =>
    http
      .get("/api/v1/auth/me")
      .set({ Authorization: `Bearer ${s.accessToken}` });
  // A missing key answers 404 to an authenticated request and 401 to an anonymous one.
  const file = (s: Session) =>
    http.get("/api/v1/files/uploads/missing.png").set("Cookie", s.fileCookie);
  const sessionOf = (s: Session) =>
    prisma.authSession.findUniqueOrThrow({
      where: { id: parseRefreshToken(s.refreshToken)!.sid },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
  });

  // Every test signs in several times; the per-route login limit (5/min) is not under test here.
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    await app.close();
  });

  describe("session cookie", () => {
    it("carries the refresh token: httpOnly, Strict, only on /auth; the body has no token but the access one", async () => {
      const res = await http
        .post("/api/v1/auth/login")
        .set("Origin", WEB_ORIGIN)
        .send({ email: await member("cookie"), password: PASSWORD })
        .expect(200);
      expect(res.body).not.toHaveProperty("refreshToken");
      expect(res.body).not.toHaveProperty("fileToken");
      expect(res.body.accessToken).toEqual(expect.any(String));
      const cookie = ([] as string[])
        .concat(res.headers["set-cookie"] ?? [])
        .find((c) => c.startsWith("cluster_session="))!;
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/Path=\/api\/v1\/auth(;|$)/);
      expect(cookie).toMatch(/Max-Age=\d+/);
    });

    it("refuses a refresh from another origin, or naming none, and leaves the session alive", async () => {
      const session = await login(await member("origin"));
      const foreign = await refresh(
        session.refreshToken,
        "https://evil.example",
      ).expect(403);
      expect(foreign.body.code).toBe("ORIGIN_MISMATCH");
      await refresh(session.refreshToken, null).expect(403);
      await refresh(session.refreshToken).expect(200);
    });

    it("refuses a sign-in posted from another origin", async () => {
      await http
        .post("/api/v1/auth/login")
        .set("Origin", "https://evil.example")
        .send({ email: await member("origin-login"), password: PASSWORD })
        .expect(403);
    });

    it("answers a refresh without a cookie with 401 and clears the cookies", async () => {
      const res = await http
        .post("/api/v1/auth/refresh")
        .set("Origin", WEB_ORIGIN)
        .expect(401);
      expect(res.body.code).toBe("SESSION_ENDED");
      expect(setCookie(res, "cluster_session")).toBe("");
    });
  });

  describe("refresh rotation", () => {
    it("rotates, and the previous token still works within the grace window", async () => {
      const session = await login(await member("rotate"));
      const next = await refreshed(session.refreshToken);
      expect(next.refreshToken).not.toBe(session.refreshToken);
      await refresh(session.refreshToken).expect(200);
    });

    it("ends every session when a rotated token comes back after the grace window", async () => {
      const email = await member("reuse");
      const session = await login(email);
      const other = await login(email);
      const next = await refreshed(session.refreshToken);
      await prisma.authSession.update({
        where: { id: (await sessionOf(session)).id },
        data: { rotatedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1000) },
      });

      expect((await refresh(session.refreshToken).expect(401)).body.code).toBe(
        "SESSION_ENDED",
      );
      await refresh(next.refreshToken).expect(401);
      await me(other).expect(401);
    });

    it("keeps one session under concurrent refreshes of the same token", async () => {
      const session = await login(await member("race"));
      const results = await Promise.all(
        Array.from({ length: 5 }, () => refresh(session.refreshToken)),
      );
      expect(results.every((r) => r.status === 200)).toBe(true);
      const { userId } = await sessionOf(session);
      expect(await prisma.authSession.count({ where: { userId } })).toBe(1);
    });

    it("refuses a session past its total limit, even if used every day", async () => {
      const session = await login(await member("total"));
      await prisma.authSession.update({
        where: { id: (await sessionOf(session)).id },
        data: { absoluteExpiresAt: new Date(Date.now() - 1) },
      });
      await refresh(session.refreshToken).expect(401);
      await me(session).expect(401);
    });
  });

  describe("logout", () => {
    it("ends the session at once: its access and file tokens stop working", async () => {
      const session = await login(await member("logout"));
      await me(session).expect(200);
      await file(session).expect(404);

      const res = await logout(session).expect(204);
      expect(setCookie(res, "cluster_session")).toBe("");

      await me(session).expect(401);
      await file(session).expect(401);
      await refresh(session.refreshToken).expect(401);
      expect((await sessionOf(session)).revokeReason).toBe("LOGOUT");
    });

    it("answers 204 with no cookie at all", async () => {
      await logout().expect(204);
    });
  });

  describe("change password", () => {
    it("ends every other session at once and keeps the device that changed it signed in", async () => {
      const email = await member("change");
      const laptop = await login(email);
      const phone = await login(email);

      const fresh = sessionFrom(
        await http
          .patch("/api/v1/auth/me/password")
          .set({ Authorization: `Bearer ${laptop.accessToken}` })
          .send({
            currentPassword: PASSWORD,
            newPassword: "Bright-meadow-2026",
          })
          .expect(200),
      );

      await me(fresh).expect(200);
      await refresh(fresh.refreshToken).expect(200);
      await me(phone).expect(401);
      await file(phone).expect(401);
      await refresh(phone.refreshToken).expect(401);
      await login(email, "Bright-meadow-2026");
    });

    it("changes nothing when the current password is wrong", async () => {
      const email = await member("change-wrong");
      const session = await login(email);
      await http
        .patch("/api/v1/auth/me/password")
        .set({ Authorization: `Bearer ${session.accessToken}` })
        .send({
          currentPassword: "Wrong1234",
          newPassword: "Bright-meadow-2026",
        })
        .expect(400);
      await refresh(session.refreshToken).expect(200);
    });
  });

  describe("deactivation", () => {
    it("ends the member's sessions, so reactivating them revives none", async () => {
      const admin = await createActor(app, "deact-admin", "ADMIN");
      const member = await createActor(
        app,
        "deact-member",
        "COLLABORATOR",
        admin.orgId,
      );
      const toggle = (isActive: boolean) =>
        http
          .patch(`/api/v1/org/members/${member.id}`)
          .set(admin.auth)
          .send({ isActive })
          .expect(200);

      await toggle(false);
      await toggle(true);

      await http.get("/api/v1/auth/me").set(member.auth).expect(401);
      const rows = await prisma.authSession.findMany({
        where: { userId: member.id },
      });
      expect(rows.map((r) => r.revokeReason)).toEqual(["DEACTIVATED"]);
    });
  });

  describe("password policy", () => {
    const change = (
      s: Session,
      newPassword: string,
      currentPassword = PASSWORD,
    ) =>
      http
        .patch("/api/v1/auth/me/password")
        .set({ Authorization: `Bearer ${s.accessToken}` })
        .send({ currentPassword, newPassword });

    it("refuses a short or common password with its own code, and accepts a lower-case phrase", async () => {
      const session = await login(await member("policy"));
      const short = await change(session, "eleven-char").expect(400);
      expect(short.body).toMatchObject({
        code: "PASSWORD_TOO_SHORT",
        params: { min: 12 },
      });
      expect(
        (await change(session, "Password1234").expect(400)).body.code,
      ).toBe("PASSWORD_TOO_COMMON");
      await change(session, "una frase sin mayusculas").expect(200);
    });

    it("never cuts a long password short: 100 characters with accents sign in, their first 72 bytes do not", async () => {
      const email = await member("long");
      const session = await login(email);
      const long = "canción-ñandú-".repeat(8).slice(0, 100);
      expect(Buffer.byteLength(long)).toBeGreaterThan(72);
      await change(session, long).expect(200);
      await login(email, long);
      const prefix = Buffer.from(long).subarray(0, 72).toString();
      await http
        .post("/api/v1/auth/login")
        .set("Origin", WEB_ORIGIN)
        .send({ email, password: prefix })
        .expect(401);
    });
  });
});
