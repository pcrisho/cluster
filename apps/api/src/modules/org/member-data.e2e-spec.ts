import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp } from "../../test-helpers";

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";

/** Subjects of the emails to `to`, waiting until one matches. */
async function waitForMail(to: string, subject: RegExp): Promise<void> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await res.json()) as {
      messages: { Subject: string }[];
    };
    if (messages.some((m) => subject.test(m.Subject))) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

/** An ADMIN edits members' data; the organization may lock self-editing (docs/specs/org/member-data). */
describe("Member data e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  const unique = () =>
    `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
  });
  afterAll(() => app.close());

  it("ADMIN edits a member's data, stored and audited", async () => {
    const admin = await createActor(app, "md-admin", "ADMIN");
    const member = await createActor(
      app,
      "md-member",
      "COLLABORATOR",
      admin.orgId,
    );
    const res = await http
      .patch(`/api/v1/org/members/${member.id}`)
      .set(admin.auth)
      .send({
        firstName: "  Ana ",
        lastName: "Pérez",
        employeeCode: " E-001 ",
        phone: "+51 999 888 777",
        birthDate: "1990-05-17",
        joinedAt: "2020-01-06",
      })
      .expect(200);
    expect(res.body).toMatchObject({
      firstName: "Ana",
      lastName: "Pérez",
      employeeCode: "E-001",
      profile: { phone: "+51 999 888 777" },
    });
    expect(res.body.profile.birthDate).toMatch(/^1990-05-17/);
    expect(res.body.profile.joinedAt).toMatch(/^2020-01-06/);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
      include: { profile: true },
    });
    expect(user).toMatchObject({ firstName: "Ana", orgColaboratorId: "E-001" });
    expect(user.profile?.birthDate?.toISOString()).toBe(
      "1990-05-17T00:00:00.000Z",
    );

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "User.UPDATE", entityId: member.id },
    });
    expect(log).toMatchObject({
      actorId: admin.id,
      organizationId: admin.orgId,
      entityType: "User",
    });
    expect(log.oldValues).toMatchObject({ firstName: "md-member" });
    expect(log.newValues).toMatchObject({
      firstName: "Ana",
      employeeCode: "E-001",
    });

    // Clearing optional fields; a save that changes nothing writes no audit row.
    await http
      .patch(`/api/v1/org/members/${member.id}`)
      .set(admin.auth)
      .send({ birthDate: null, employeeCode: null, phone: null })
      .expect(200);
    const cleared = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
      include: { profile: true },
    });
    expect(cleared.orgColaboratorId).toBeNull();
    expect(cleared.profile).toMatchObject({ birthDate: null, phone: null });
    const before = await prisma.auditLog.count({
      where: { entityId: member.id },
    });
    await http
      .patch(`/api/v1/org/members/${member.id}`)
      .set(admin.auth)
      .send({ firstName: "Ana" })
      .expect(200);
    expect(
      await prisma.auditLog.count({ where: { entityId: member.id } }),
    ).toBe(before);
  });

  it("audits role and status changes", async () => {
    const admin = await createActor(app, "md-role-admin", "ADMIN");
    const member = await createActor(
      app,
      "md-role",
      "COLLABORATOR",
      admin.orgId,
    );
    await http
      .patch(`/api/v1/org/members/${member.id}`)
      .set(admin.auth)
      .send({ role: "MANAGER" })
      .expect(200);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "User.UPDATE", entityId: member.id },
    });
    expect(log.oldValues).toEqual({ role: "COLLABORATOR" });
    expect(log.newValues).toEqual({ role: "MANAGER" });
  });

  it("ADMIN edits their own data but not their own role", async () => {
    const admin = await createActor(app, "md-self", "ADMIN");
    await http
      .patch(`/api/v1/org/members/${admin.id}`)
      .set(admin.auth)
      .send({ firstName: "Self", joinedAt: "2019-03-01" })
      .expect(200);
    const res = await http
      .patch(`/api/v1/org/members/${admin.id}`)
      .set(admin.auth)
      .send({ role: "COLLABORATOR" })
      .expect(400);
    expect(res.body.code).toBe("OWN_MEMBERSHIP");
  });

  it("another organization's ADMIN gets 404; a non-ADMIN gets 403", async () => {
    const admin = await createActor(app, "md-iso-admin", "ADMIN");
    const member = await createActor(
      app,
      "md-iso",
      "COLLABORATOR",
      admin.orgId,
    );
    const outsider = await createActor(app, "md-outsider", "ADMIN");
    await http
      .patch(`/api/v1/org/members/${member.id}`)
      .set(outsider.auth)
      .send({ firstName: "Hacked" })
      .expect(404);
    const peer = await createActor(app, "md-peer", "MANAGER", admin.orgId);
    await http
      .patch(`/api/v1/org/members/${member.id}`)
      .set(peer.auth)
      .send({ firstName: "Hacked" })
      .expect(403);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
    });
    expect(user.firstName).toBe("md-iso");
  });

  it("the superadmin's data, role and status are out of a tenant ADMIN's reach", async () => {
    const admin = await createActor(app, "md-sa-admin", "ADMIN");
    const superAdmin = await createActor(app, "md-sa", "ADMIN", admin.orgId);
    await prisma.user.update({
      where: { id: superAdmin.id },
      data: { isSuperAdmin: true },
    });
    for (const body of [
      { firstName: "Taken" },
      { email: `takeover-${unique()}@x.com` },
      { role: "COLLABORATOR" },
      { isActive: false },
    ]) {
      const res = await http
        .patch(`/api/v1/org/members/${superAdmin.id}`)
        .set(admin.auth)
        .send(body)
        .expect(403);
      expect(res.body.code).toBe("SUPERADMIN_PROTECTED");
    }
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: superAdmin.id },
    });
    expect(user).toMatchObject({
      firstName: "md-sa",
      role: "ADMIN",
      isActive: true,
    });
  });

  it("answers 409 for a taken e-mail or employee code, 400 for bad values", async () => {
    const admin = await createActor(app, "md-dup-admin", "ADMIN");
    const a = await createActor(app, "md-dup-a", "COLLABORATOR", admin.orgId);
    const b = await createActor(app, "md-dup-b", "COLLABORATOR", admin.orgId);
    const elsewhere = await createActor(app, "md-dup-else");
    const { email } = await prisma.user.findUniqueOrThrow({
      where: { id: elsewhere.id },
    });

    let res = await http
      .patch(`/api/v1/org/members/${a.id}`)
      .set(admin.auth)
      .send({ email: email.toUpperCase() })
      .expect(409);
    expect(res.body.code).toBe("EMAIL_TAKEN");

    await http
      .patch(`/api/v1/org/members/${a.id}`)
      .set(admin.auth)
      .send({ employeeCode: "X1" })
      .expect(200);
    res = await http
      .patch(`/api/v1/org/members/${b.id}`)
      .set(admin.auth)
      .send({ employeeCode: "X1" })
      .expect(409);
    expect(res.body.code).toBe("EMPLOYEE_CODE_TAKEN");
    // The code is unique per organization only.
    await http
      .patch(`/api/v1/org/members/${elsewhere.id}`)
      .set(
        (await createActor(app, "md-dup-else-admin", "ADMIN", elsewhere.orgId))
          .auth,
      )
      .send({ employeeCode: "X1" })
      .expect(200);

    const tomorrow = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    res = await http
      .patch(`/api/v1/org/members/${a.id}`)
      .set(admin.auth)
      .send({ birthDate: tomorrow })
      .expect(400);
    expect(res.body.code).toBe("DATE_IN_FUTURE");
    for (const body of [
      { firstName: "   " },
      { firstName: null },
      { joinedAt: null },
      { birthDate: "2020-02-30" },
      { birthDate: "17/05/1990" },
      { email: "not-an-email" },
    ]) {
      await http
        .patch(`/api/v1/org/members/${a.id}`)
        .set(admin.auth)
        .send(body)
        .expect(400);
    }
  });

  it("an e-mail change notifies the old address, ends sessions and re-sends a pending invitation", async () => {
    const admin = await createActor(app, "md-mail-admin", "ADMIN");
    const member = await createActor(
      app,
      "md-mail",
      "COLLABORATOR",
      admin.orgId,
    );
    const { email: oldEmail } = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
    });
    await http.get("/api/v1/auth/me").set(member.auth).expect(200);

    const newEmail = `MD-New-${unique()}@X.com`;
    const res = await http
      .patch(`/api/v1/org/members/${member.id}`)
      .set(admin.auth)
      .send({ email: ` ${newEmail} ` })
      .expect(200);
    expect(res.body.email).toBe(newEmail.toLowerCase());

    await http.get("/api/v1/auth/me").set(member.auth).expect(401);
    await waitForMail(
      oldEmail,
      /email address of your Cluster account was changed/i,
    );
    await waitForMail(newEmail.toLowerCase(), /invited/i);
  });

  it("with self-editing off, a member keeps only their preferences; an ADMIN is unaffected", async () => {
    const admin = await createActor(app, "md-lock-admin", "ADMIN");
    const member = await createActor(
      app,
      "md-lock",
      "COLLABORATOR",
      admin.orgId,
    );
    const me = await http.get("/api/v1/auth/me").set(member.auth).expect(200);
    expect(me.body.user.organization.memberProfileEditing).toBe(true);

    await http
      .patch("/api/v1/org")
      .set(admin.auth)
      .send({ memberProfileEditing: false })
      .expect(200);
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "Organization.UPDATE", entityId: admin.orgId },
    });
    expect(log.newValues).toEqual({ memberProfileEditing: false });
    const locked = await http
      .get("/api/v1/auth/me")
      .set(member.auth)
      .expect(200);
    expect(locked.body.user.organization.memberProfileEditing).toBe(false);

    for (const body of [
      { firstName: "New" },
      { lastName: "New" },
      { avatarUrl: null },
    ]) {
      const res = await http
        .patch("/api/v1/auth/me")
        .set(member.auth)
        .send(body)
        .expect(403);
      expect(res.body.code).toBe("PROFILE_LOCKED");
    }
    for (const body of [{ phone: "123" }, { bio: "Hi" }]) {
      const res = await http
        .patch("/api/v1/profile/me")
        .set(member.auth)
        .send(body)
        .expect(403);
      expect(res.body.code).toBe("PROFILE_LOCKED");
    }
    await http
      .patch("/api/v1/auth/me")
      .set(member.auth)
      .send({ locale: "es" })
      .expect(200);
    await http
      .patch("/api/v1/profile/me")
      .set(member.auth)
      .send({ showBirthday: false })
      .expect(200);

    await http
      .patch("/api/v1/auth/me")
      .set(admin.auth)
      .send({ firstName: "Boss" })
      .expect(200);
    await http
      .patch("/api/v1/profile/me")
      .set(admin.auth)
      .send({ phone: "456" })
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: member.id },
      include: { profile: true },
    });
    expect(user).toMatchObject({ firstName: "md-lock", locale: "es" });
    expect(user.profile).toMatchObject({ phone: null, showBirthday: false });
  });

  it("a member's own name must not be empty", async () => {
    const member = await createActor(app, "md-name");
    await http
      .patch("/api/v1/auth/me")
      .set(member.auth)
      .send({ firstName: "  " })
      .expect(400);
    await http
      .patch("/api/v1/auth/me")
      .set(member.auth)
      .send({ lastName: "x".repeat(101) })
      .expect(400);
  });
});
