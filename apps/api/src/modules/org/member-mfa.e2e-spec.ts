import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import {
  createActor,
  createTestApp,
  WEB_ORIGIN,
  type TestActor,
} from "../../test-helpers";
import { hashPassword } from "../auth/password-hash";
import { MfaService } from "../auth/mfa.service";
import { totpNow } from "../auth/totp";

const PASSWORD = "Admin-second-factor-2026";

/**
 * 2FA administered by the organization (docs/specs/auth/hardening T20, R-19, R-20): an ADMIN requires it of
 * the organization's ADMINs and resets a member's, inside their own organization only.
 */
describe("Organization 2FA e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let mfa: MfaService;
  let http: ReturnType<typeof request>;

  /** A person of the organization who signs in with a password. */
  async function withPassword(
    orgId: string,
    name: string,
    role: "ADMIN" | "COLLABORATOR",
  ) {
    const email = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@x.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(PASSWORD, 4),
        firstName: "Org",
        lastName: "Person",
        role,
        organizationId: orgId,
      },
    });
    return { email, id: user.id };
  }
  const login = (email: string) =>
    http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(200);
  async function enroll(userId: string) {
    const { secret } = await mfa.startEnrollment(userId, "x", "Cluster");
    await mfa.confirmEnrollment(userId, totpNow(secret));
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    mfa = app.get(MfaService);
    http = request(app.getHttpServer());
  });
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => app.close());

  it("requires 2FA of the ADMINs once an ADMIN turns it on, audited, and only an ADMIN can", async () => {
    const owner = await createActor(app, "require-owner", "ADMIN");
    const admin = await withPassword(owner.orgId, "require-admin", "ADMIN");
    const member = await withPassword(
      owner.orgId,
      "require-member",
      "COLLABORATOR",
    );
    const collaborator = await createActor(
      app,
      "require-collab",
      "COLLABORATOR",
      owner.orgId,
    );

    expect((await login(admin.email)).body.accessToken).toEqual(
      expect.any(String),
    );
    await http
      .patch("/api/v1/org")
      .set(collaborator.auth)
      .send({ requireAdminMfa: true })
      .expect(403);
    const res = await http
      .patch("/api/v1/org")
      .set(owner.auth)
      .send({ requireAdminMfa: true })
      .expect(200);
    expect(res.body.requireAdminMfa).toBe(true);

    expect((await login(admin.email)).body).toEqual({
      mfa: "ENROLL",
      challengeId: expect.any(String),
    });
    expect((await login(member.email)).body.accessToken).toEqual(
      expect.any(String),
    );
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { organizationId: owner.orgId, action: "Organization.UPDATE" },
    });
    expect(entry.newValues).toMatchObject({ requireAdminMfa: true });
  });

  it("lets an ADMIN reset a member's 2FA and password: audited, the member signed out everywhere", async () => {
    const owner = await createActor(app, "reset-owner", "ADMIN");
    const member = await withPassword(
      owner.orgId,
      "reset-member",
      "COLLABORATOR",
    );
    await enroll(member.id);
    const { token } = await signedIn(member.id);

    const listed = await http
      .get("/api/v1/org/members")
      .set(owner.auth)
      .expect(200);
    expect(
      listed.body.items.find((m: { id: string }) => m.id === member.id).mfaEnabled,
    ).toBe(true);

    await http
      .delete(`/api/v1/org/members/${member.id}/mfa`)
      .set(owner.auth)
      .expect(204);
    expect(await mfa.isEnabled(member.id)).toBe(false);
    await http
      .get("/api/v1/auth/me")
      .set({ Authorization: `Bearer ${token}` })
      .expect(401);
    // The old password goes too: whoever stole it cannot enroll their own phone.
    await http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .send({ email: member.email, password: PASSWORD })
      .expect(401);
    const link = await prisma.passwordLink.findUniqueOrThrow({
      where: { userId: member.id },
    });
    expect(link.purpose).toBe("RESET");
    expect(link.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 23 * 3600_000,
    );
    expect(
      await prisma.auditLog.count({
        where: {
          organizationId: owner.orgId,
          action: "UserMfa.RESET",
          entityId: member.id,
          actorId: owner.id,
        },
      }),
    ).toBe(1);
    expect(
      await prisma.authEvent.count({
        where: { userId: member.id, type: "MFA_RESET" },
      }),
    ).toBe(1);
  });

  it("refuses a reset outside the organization, by a non-ADMIN, of oneself or of a superadmin", async () => {
    const owner = await createActor(app, "refuse-owner", "ADMIN");
    const stranger = await createActor(app, "refuse-stranger", "COLLABORATOR");
    const collaborator = await createActor(
      app,
      "refuse-collab",
      "COLLABORATOR",
      owner.orgId,
    );
    const superAdmin = await createActor(
      app,
      "refuse-super",
      "COLLABORATOR",
      owner.orgId,
    );
    await prisma.user.update({
      where: { id: superAdmin.id },
      data: { isSuperAdmin: true },
    });
    await enroll(stranger.id);
    await enroll(superAdmin.id);

    const reset = (actor: TestActor, id: string) =>
      http.delete(`/api/v1/org/members/${id}/mfa`).set(actor.auth);
    await reset(owner, stranger.id).expect(404);
    await reset(collaborator, owner.id).expect(403);
    await reset(owner, owner.id).expect(400);
    await reset(owner, superAdmin.id)
      .expect(403)
      .expect((r) => expect(r.body.code).toBe("SUPERADMIN_PROTECTED"));
    expect(await mfa.isEnabled(stranger.id)).toBe(true);
    expect(await mfa.isEnabled(superAdmin.id)).toBe(true);
  });

  /** A live session of a member with 2FA, signed in through the real code step (a recovery code). */
  async function signedIn(userId: string) {
    const { email } = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });
    const { challengeId } = (await login(email)).body;
    const [recoveryCode] = await mfa.replaceRecoveryCodes(userId);
    const res = await http
      .post("/api/v1/auth/mfa/verify")
      .set("Origin", WEB_ORIGIN)
      .send({ challengeId, recoveryCode })
      .expect(200);
    return { token: res.body.accessToken as string };
  }
});
