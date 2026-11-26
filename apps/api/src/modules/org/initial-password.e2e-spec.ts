import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { PasswordLinksService } from "../auth/password-links.service";

const PASSWORD = "Quiet-harbor-2026";
const HOUR = 3_600_000;

/** An initial password: issued by an ADMIN, signed in with, then replaced by the person (docs/specs/auth/access-without-mail). */
describe("Initial password e2e", () => {
  let app: INestApplication;
  let db: SystemPrismaService;
  let admin: TestActor;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(SystemPrismaService);
    admin = await createActor(app, "ip-admin", "ADMIN");
  });
  afterAll(() => app.close());

  async function pendingMember() {
    return createActor(app, "ip-member", "COLLABORATOR", admin.orgId);
  }
  const issue = (id: string, body: object, auth = admin.auth) =>
    request(app.getHttpServer())
      .post(`/api/v1/org/members/${id}/access`)
      .set(auth)
      .send(body);
  const login = (email: string, password: string) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email, password });
  const emailOf = async (id: string) =>
    (await db.user.findUniqueOrThrow({ where: { id } })).email;

  it("issues a 16-character password once, lasting the chosen time, stored only as a hash", async () => {
    const m = await pendingMember();
    const before = Date.now();
    const res = await issue(m.id, { kind: "password", lifetime: 24 }).expect(
      200,
    );
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.password).toMatch(/^[a-km-zA-HJ-NP-Z2-9]{16}$/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThanOrEqual(
      before + 24 * HOUR - 5000,
    );

    const row = await db.user.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.passwordHash).not.toContain(res.body.password);
    expect(row.passwordHash.startsWith("$2")).toBe(true);
    expect(row.tempPasswordExpiresAt?.getTime()).toBe(
      new Date(res.body.expiresAt).getTime(),
    );
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "User.ISSUE_ACCESS", entityId: m.id },
    });
    expect(JSON.stringify(log)).not.toContain(res.body.password);
  });

  it("sign-in with the initial password asks the person to set their own, then gives a session", async () => {
    const m = await pendingMember();
    const email = await emailOf(m.id);
    const { password } = (
      await issue(m.id, { kind: "password", lifetime: 72 }).expect(200)
    ).body;

    const step = await login(email, password).expect(200);
    expect(step.body.mfa).toBe("PASSWORD_CHANGE");
    expect(step.body.accessToken).toBeUndefined();

    const done = await request(app.getHttpServer())
      .post("/api/v1/auth/password/initial")
      .send({ challengeId: step.body.challengeId, password: PASSWORD })
      .expect(200);
    expect(done.body.accessToken).toEqual(expect.any(String));

    const row = await db.user.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.passwordSetAt).not.toBeNull();
    expect(row.tempPasswordExpiresAt).toBeNull();
    // The initial password is gone: the new one works, the old one does not.
    await login(email, password)
      .expect(401)
      .expect((r) => expect(r.body.code).toBe("INVALID_CREDENTIALS"));
    await login(email, PASSWORD).expect(200);
  });

  it("the new password goes through the policy; a refused one keeps the step usable", async () => {
    const m = await pendingMember();
    const email = await emailOf(m.id);
    const { password } = (
      await issue(m.id, { kind: "password", lifetime: 24 }).expect(200)
    ).body;
    const { challengeId } = (await login(email, password).expect(200)).body;
    await request(app.getHttpServer())
      .post("/api/v1/auth/password/initial")
      .send({ challengeId, password: "abc" })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("PASSWORD_TOO_SHORT"));
    await request(app.getHttpServer())
      .post("/api/v1/auth/password/initial")
      .send({ challengeId, password: PASSWORD })
      .expect(200);
  });

  it("an expired initial password answers INVALID_CREDENTIALS and is recorded as a failed sign-in", async () => {
    const m = await pendingMember();
    const email = await emailOf(m.id);
    const { password } = (
      await issue(m.id, { kind: "password", lifetime: 24 }).expect(200)
    ).body;
    await db.user.update({
      where: { id: m.id },
      data: { tempPasswordExpiresAt: new Date(Date.now() - 1000) },
    });

    await login(email, password)
      .expect(401)
      .expect((r) => expect(r.body.code).toBe("INVALID_CREDENTIALS"));
    const event = await db.authEvent.findFirst({
      where: { type: "LOGIN_FAILED", userId: m.id },
      orderBy: { createdAt: "desc" },
    });
    expect(event?.detail).toMatchObject({ reason: "INITIAL_EXPIRED" });
  });

  it("an active member gets 409 MEMBER_ACTIVE for a password", async () => {
    const m = await createActor(app, "ip-active", "COLLABORATOR", admin.orgId);
    await db.user.update({
      where: { id: m.id },
      data: { passwordSetAt: new Date() },
    });
    await issue(m.id, { kind: "password", lifetime: 24 })
      .expect(409)
      .expect((r) => expect(r.body.code).toBe("MEMBER_ACTIVE"));
  });

  it("the lifetime presets of an invitation apply to a password too", async () => {
    const m = await pendingMember();
    await issue(m.id, { kind: "password", lifetime: 1 })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("INVALID_LIFETIME"));
  });

  it("issuing a link clears the password, and issuing a password clears the link", async () => {
    const m = await pendingMember();
    const email = await emailOf(m.id);
    const { password } = (
      await issue(m.id, { kind: "password", lifetime: 24 }).expect(200)
    ).body;

    const link = (
      await issue(m.id, { kind: "link", lifetime: 168 }).expect(200)
    ).body.url;
    const token = new URL(link).searchParams.get("token")!;
    const row = await db.user.findUniqueOrThrow({ where: { id: m.id } });
    expect(row.tempPasswordExpiresAt).toBeNull();
    await login(email, password).expect(401);

    const second = (
      await issue(m.id, { kind: "password", lifetime: 24 }).expect(200)
    ).body.password;
    expect(
      await db.passwordLink.findUnique({ where: { userId: m.id } }),
    ).toBeNull();
    await request(app.getHttpServer())
      .post("/api/v1/auth/set-password")
      .send({ token, password: PASSWORD })
      .expect(400)
      .expect((r) => expect(r.body.code).toBe("LINK_INVALID"));
    await login(email, second).expect(200);
  });

  it("forgot password leaves the initial password working; using the reset link ends it", async () => {
    const m = await pendingMember();
    const email = await emailOf(m.id);
    const { password } = (
      await issue(m.id, { kind: "password", lifetime: 24 }).expect(200)
    ).body;

    // Anyone who knows the address can ask: the link goes to the mailbox, the handed-over password stays.
    await request(app.getHttpServer())
      .post("/api/v1/auth/forgot-password")
      .send({ email })
      .expect(204);
    for (
      let i = 0;
      i < 40 &&
      !(await db.passwordLink.findUnique({ where: { userId: m.id } }));
      i++
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(
      (await db.passwordLink.findUniqueOrThrow({ where: { userId: m.id } }))
        .purpose,
    ).toBe("RESET");
    expect((await login(email, password).expect(200)).body.mfa).toBe(
      "PASSWORD_CHANGE",
    );

    // The person uses a reset link instead: the initial password ends with it.
    const token = await app
      .get(PasswordLinksService)
      .issue(m.id, "RESET", 3600);
    await request(app.getHttpServer())
      .post("/api/v1/auth/set-password")
      .send({ token, password: PASSWORD })
      .expect(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: m.id } }))
        .tempPasswordExpiresAt,
    ).toBeNull();
    await login(email, password).expect(401);
    expect((await login(email, PASSWORD).expect(200)).body.mfa).toBeUndefined();
  });

  it("a password challenge is not accepted by the two-step verification", async () => {
    const m = await pendingMember();
    const email = await emailOf(m.id);
    const { password } = (
      await issue(m.id, { kind: "password", lifetime: 24 }).expect(200)
    ).body;
    const { challengeId } = (await login(email, password).expect(200)).body;
    await request(app.getHttpServer())
      .post("/api/v1/auth/mfa/verify")
      .send({ challengeId, code: "123456" })
      .expect(410)
      .expect((r) => expect(r.body.code).toBe("CHALLENGE_ENDED"));
  });

  it("another organization's member is not found and a collaborator cannot issue", async () => {
    const other = await createActor(app, "ip-other");
    await issue(other.id, { kind: "password", lifetime: 24 }).expect(404);
    const collaborator = await createActor(
      app,
      "ip-collab",
      "COLLABORATOR",
      admin.orgId,
    );
    const m = await pendingMember();
    await issue(
      m.id,
      { kind: "password", lifetime: 24 },
      collaborator.auth,
    ).expect(403);
  });
});
