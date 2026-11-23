import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";
const HOUR = 3_600_000;

async function mailCount(to: string): Promise<number> {
  const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
  return ((await res.json()) as { messages: unknown[] }).messages.length;
}

/** ADMIN creates a link for a member of their organization (docs/specs/auth/access-without-mail). */
describe("Access links (ADMIN) e2e", () => {
  let app: INestApplication;
  let db: SystemPrismaService;
  let admin: TestActor;

  beforeAll(async () => {
    app = await createTestApp();
    db = app.get(SystemPrismaService);
    admin = await createActor(app, "al-admin", "ADMIN");
  });
  afterAll(() => app.close());

  /** A member of the admin's organization; `active` sets a password, the default is a pending invitation. */
  async function member(active: boolean, extra: Record<string, unknown> = {}) {
    const m = await createActor(app, "al-member", "COLLABORATOR", admin.orgId);
    await db.user.update({
      where: { id: m.id },
      data: { ...(active && { passwordSetAt: new Date() }), ...extra },
    });
    return m;
  }

  const issue = (id: string, body: object, auth = admin.auth) =>
    request(app.getHttpServer()).post(`/api/v1/org/members/${id}/access`).set(auth).send(body);

  const tokenOf = (url: string) => new URL(url).searchParams.get("token")!;

  it("a pending member gets an INVITE link that lasts the chosen preset", async () => {
    const m = await member(false);
    const before = Date.now();
    const res = await issue(m.id, { kind: "link", lifetime: 72 }).expect(200);
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.url).toMatch(/\/set-password\?token=/);
    const expires = new Date(res.body.expiresAt).getTime();
    expect(expires).toBeGreaterThanOrEqual(before + 72 * HOUR - 5000);
    expect(expires).toBeLessThanOrEqual(Date.now() + 72 * HOUR + 5000);
    const link = await db.passwordLink.findUniqueOrThrow({ where: { userId: m.id } });
    expect(link.purpose).toBe("INVITE");
  });

  it("an active member gets a RESET link; the default lifetime is 24 hours when given", async () => {
    const m = await member(true);
    const res = await issue(m.id, { kind: "link", lifetime: 1 }).expect(200);
    const link = await db.passwordLink.findUniqueOrThrow({ where: { userId: m.id } });
    expect(link.purpose).toBe("RESET");
    expect(new Date(res.body.expiresAt).getTime()).toBeLessThanOrEqual(Date.now() + HOUR + 5000);
  });

  it("a lifetime outside the presets of its purpose is refused", async () => {
    const pending = await member(false);
    const active = await member(true);
    for (const [target, lifetime] of [
      [pending.id, 5],
      [active.id, 168], // a 7-day RESET is not a preset
      [pending.id, 24 * 31],
    ] as const) {
      const res = await issue(target, { kind: "link", lifetime }).expect(400);
      expect(res.body.code).toBe("INVALID_LIFETIME");
    }
  });

  it("issuing again replaces the previous link: the old one stops working", async () => {
    const m = await member(false);
    const first = tokenOf((await issue(m.id, { kind: "link", lifetime: 168 }).expect(200)).body.url);
    const second = tokenOf((await issue(m.id, { kind: "link", lifetime: 168 }).expect(200)).body.url);
    await request(app.getHttpServer())
      .post("/api/v1/auth/set-password")
      .send({ token: first, password: "Quiet-harbor-2026" })
      .expect(400)
      .expect((res) => expect(res.body.code).toBe("LINK_INVALID"));
    expect(second).not.toBe(first);
  });

  it("a RESET link does not skip two-step verification", async () => {
    const m = await member(true, { role: "ADMIN" });
    await db.organization.update({ where: { id: admin.orgId }, data: { requireAdminMfa: true } });
    const token = tokenOf((await issue(m.id, { kind: "link", lifetime: 24 }).expect(200)).body.url);
    const res = await request(app.getHttpServer())
      .post("/api/v1/auth/set-password")
      .send({ token, password: "Quiet-harbor-2026" })
      .expect(200);
    expect(res.body.mfa).toBe("ENROLL");
    expect(res.body.accessToken).toBeUndefined();
  });

  it("superadmin, oneself and a deactivated member are refused", async () => {
    const superadmin = await member(true, { isSuperAdmin: true });
    const off = await member(true, { isActive: false });
    await issue(superadmin.id, { kind: "link", lifetime: 24 }).expect(403).expect((r) =>
      expect(r.body.code).toBe("SUPERADMIN_PROTECTED"),
    );
    await issue(admin.id, { kind: "link", lifetime: 24 }).expect(400).expect((r) =>
      expect(r.body.code).toBe("ACCESS_SELF"),
    );
    await issue(off.id, { kind: "link", lifetime: 24 }).expect(409).expect((r) =>
      expect(r.body.code).toBe("MEMBER_INACTIVE"),
    );
  });

  it("audits the issue without the secret", async () => {
    const m = await member(false);
    const token = tokenOf((await issue(m.id, { kind: "link", lifetime: 336 }).expect(200)).body.url);
    const log = await db.auditLog.findFirstOrThrow({
      where: { action: "User.ISSUE_ACCESS", entityId: m.id },
    });
    expect(log.organizationId).toBe(admin.orgId);
    expect(log.newValues).toMatchObject({ kind: "link", purpose: "INVITE", lifetime: 336 });
    expect(JSON.stringify(log)).not.toContain(token);
  });

  it("a RESET link to an active member sends them a security notice; an INVITE does not", async () => {
    const active = await member(true);
    const pending = await member(false);
    await issue(active.id, { kind: "link", lifetime: 24 }).expect(200);
    await issue(pending.id, { kind: "link", lifetime: 168 }).expect(200);
    const { email } = await db.user.findUniqueOrThrow({ where: { id: active.id } });
    const pendingEmail = (await db.user.findUniqueOrThrow({ where: { id: pending.id } })).email;
    await new Promise((r) => setTimeout(r, 1000));
    expect(await mailCount(email)).toBeGreaterThanOrEqual(1);
    expect(await mailCount(pendingEmail)).toBe(0);
  });

  it("another organization's member is not found", async () => {
    const other = await createActor(app, "al-other");
    await issue(other.id, { kind: "link", lifetime: 168 }).expect(404);
  });

  it("a collaborator cannot issue access", async () => {
    const collaborator = await createActor(app, "al-collab", "COLLABORATOR", admin.orgId);
    const target = await member(false);
    await issue(target.id, { kind: "link", lifetime: 168 }, collaborator.auth).expect(403);
  });
});
