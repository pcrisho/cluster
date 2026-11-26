import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { config } from "dotenv";
import { resolve } from "path";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import {
  createActor,
  createTestApp,
  signToken,
  WEB_ORIGIN,
  type TestActor,
} from "../../test-helpers";
import { MailService } from "./mail.service";

config({ path: resolve(__dirname, "../../../../../.env") });

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";

/** Mailpit messages addressed to `to`; the count must stay 0 when mail is off. */
async function mailpitCount(to: string): Promise<number> {
  const res = await fetch(
    `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
  );
  const { messages } = (await res.json()) as { messages: unknown[] };
  return messages.length;
}

describe("Mail off (no SMTP_HOST) e2e", () => {
  let app: INestApplication;
  let savedSmtpHost: string | undefined;

  beforeAll(async () => {
    // ConfigModule and dotenv never override a variable already set, so an empty value turns mail off.
    savedSmtpHost = process.env.SMTP_HOST;
    process.env.SMTP_HOST = "";
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    if (savedSmtpHost === undefined) delete process.env.SMTP_HOST;
    else process.env.SMTP_HOST = savedSmtpHost;
  });

  it("GET /instance/public says mail is off", async () => {
    const res = await request(app.getHttpServer())
      .get("/api/v1/instance/public")
      .expect(200);
    expect(res.body.mailEnabled).toBe(false);
  });

  it("a message is skipped: nothing reaches Mailpit and the send resolves", async () => {
    const to = `mail-off-${Date.now()}@x.com`;
    await app.get(MailService).send({
      to,
      subject: "Skipped",
      text: "not sent",
      html: "<p>not sent</p>",
    });
    expect(await mailpitCount(to)).toBe(0);
  });

  describe("flows with mail off", () => {
    let admin: TestActor;
    let db: SystemPrismaService;

    beforeAll(async () => {
      db = app.get(SystemPrismaService);
      admin = await createActor(app, "mo-admin", "ADMIN");
    });

    /** A member of the admin's organization; `active` sets a password, the default is a pending invitation. */
    async function member(active: boolean) {
      const m = await createActor(
        app,
        "mo-member",
        "COLLABORATOR",
        admin.orgId,
      );
      if (active)
        await db.user.update({
          where: { id: m.id },
          data: { passwordSetAt: new Date() },
        });
      return m;
    }
    const linksOf = (userId: string) =>
      db.passwordLink.count({ where: { userId } });
    const queuedOf = async (id: string) =>
      (await db.user.findUniqueOrThrow({ where: { id } })).inviteQueuedAt;
    const emailOf = async (id: string) =>
      (await db.user.findUniqueOrThrow({ where: { id } })).email;

    it("invite: the member is created, nothing is sent, and the answer says so", async () => {
      const email = `mo-invite-${Date.now()}@x.com`;
      const res = await request(app.getHttpServer())
        .post("/api/v1/org/members")
        .set(admin.auth)
        .send({
          email,
          firstName: "Mo",
          lastName: "Invite",
          role: "COLLABORATOR",
        })
        .expect(201);
      expect(res.body).toMatchObject({ inviteSent: false, mailEnabled: false });
      expect(await mailpitCount(email)).toBe(0);
      const row = await db.user.findUniqueOrThrow({ where: { email } });
      expect(await linksOf(row.id)).toBe(0);
    });

    it("forgot password: 204, no link issued, nothing sent", async () => {
      const m = await member(true);
      const email = await emailOf(m.id);
      await request(app.getHttpServer())
        .post("/api/v1/auth/forgot-password")
        .set("Origin", WEB_ORIGIN)
        .send({ email })
        .expect(204);
      await new Promise((r) => setTimeout(r, 300));
      expect(await linksOf(m.id)).toBe(0);
      expect(await mailpitCount(email)).toBe(0);
    });

    it("2FA reset: the password goes, no link is issued, nothing is sent", async () => {
      const m = await member(true);
      const email = await emailOf(m.id);
      await request(app.getHttpServer())
        .delete(`/api/v1/org/members/${m.id}/mfa`)
        .set(admin.auth)
        .expect(204);
      expect(await linksOf(m.id)).toBe(0);
      expect(
        (await db.user.findUniqueOrThrow({ where: { id: m.id } })).passwordHash,
      ).toBe("!");
      expect(await mailpitCount(email)).toBe(0);
    });

    it("resend invitation: inviteSent false, no link issued", async () => {
      const m = await member(false);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/org/members/${m.id}/resend-invite`)
        .set(admin.auth)
        .expect(200);
      expect(res.body).toMatchObject({ inviteSent: false, mailEnabled: false });
      expect(await linksOf(m.id)).toBe(0);
    });

    it("an e-mail change warns nobody and invites nobody", async () => {
      const active = await member(true);
      const oldEmail = await emailOf(active.id);
      const newEmail = `mo-changed-${Date.now()}@x.com`;
      await request(app.getHttpServer())
        .patch(`/api/v1/org/members/${active.id}`)
        .set(admin.auth)
        .send({ email: newEmail })
        .expect(200);
      expect(await mailpitCount(oldEmail)).toBe(0);
      expect(await mailpitCount(newEmail)).toBe(0);
      expect(await linksOf(active.id)).toBe(0);
    });

    it("paced invitations are refused: 409 MAIL_DISABLED", async () => {
      const m = await member(false);
      const nodeRes = await db.orgNode.create({
        data: { name: `mo-node-${Date.now()}`, organizationId: admin.orgId },
      });
      await db.userProfile.create({
        data: {
          userId: m.id,
          organizationId: admin.orgId,
          orgNodeId: nodeRes.id,
        },
      });
      const res = await request(app.getHttpServer())
        .post("/api/v1/org/invitations")
        .set(admin.auth)
        .send({ nodeId: nodeRes.id })
        .expect(409);
      expect(res.body.code).toBe("MAIL_DISABLED");
      expect(await queuedOf(m.id)).toBeNull();
    });

    it("superadmin creates an organization: the answer says no invitation went out", async () => {
      const superadmin = await db.user.findUniqueOrThrow({
        where: { email: "admin@cluster.example" },
      });
      const email = `mo-tenant-${Date.now()}@x.com`;
      const res = await request(app.getHttpServer())
        .post("/api/v1/instance/organizations")
        .set({ Authorization: `Bearer ${await signToken(app, superadmin.id)}` })
        .send({
          name: `MO tenant ${Date.now()}`,
          timezone: "UTC",
          admin: { email, firstName: "Mo", lastName: "Tenant" },
        })
        .expect(201);
      expect(res.body).toMatchObject({ inviteSent: false, mailEnabled: false });
      expect(await linksOf(res.body.admin.id)).toBe(0);
      expect(await mailpitCount(email)).toBe(0);
    });

    it("an access link still works with mail off, and no notice is sent for it", async () => {
      const m = await member(true);
      const email = await emailOf(m.id);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/org/members/${m.id}/access`)
        .set(admin.auth)
        .send({ kind: "link", lifetime: 24 })
        .expect(200);
      expect(res.body.url).toMatch(/set-password\?token=/);
      expect(await linksOf(m.id)).toBe(1);
      expect(await mailpitCount(email)).toBe(0);
    });
  });
});
