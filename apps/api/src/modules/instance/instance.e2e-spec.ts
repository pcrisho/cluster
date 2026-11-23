import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { config } from "dotenv";
import { resolve } from "path";
import { AppModule } from "../../app.module";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { setCookie, signToken } from "../../test-helpers";

config({ path: resolve(__dirname, "../../../../../.env") });

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";
const PASSWORD = "Quiet-harbor-2026";

/**
 * Polls Mailpit for the latest email sent to `to` and returns the token of its set-password link.
 * `atLeast`: how many emails that address must have received, for an email sent after an earlier one.
 */
async function tokenFromMail(to: string, atLeast = 1): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length >= atLeast) {
      const msg = (await (
        await fetch(`${MAILPIT_URL}/api/v1/message/${messages[0].ID}`)
      ).json()) as {
        Text: string;
      };
      const match = msg.Text.match(/set-password\?token=([\w-]+)/);
      if (match) return match[1];
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email received for ${to}`);
}

describe("Instance (god mode), tenant admin and invitations e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let superToken: string;
  let superOrgId: string;
  let tenantId: string;
  let tenantAdminToken: string;
  let tenantAdminRefresh: string;
  const ts = Date.now();
  const tenantAdminEmail = `tenant-admin-${ts}@x.com`;
  const memberEmail = `tenant-member-${ts}@x.com`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([
          { name: "default", limit: 10000, ttl: 60000 },
        ]),
        AppModule,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api/v1");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());

    // Seeded superadmin (prisma/seed.ts). Its sign-in needs 2FA (mfa.e2e-spec.ts): a session is made directly.
    const admin = await prisma.user.findUniqueOrThrow({
      where: { email: "admin@cluster.example" },
    });
    expect(admin.isSuperAdmin).toBe(true);
    superToken = await signToken(app, admin.id);
    superOrgId = admin.organizationId;
  });

  afterAll(async () => {
    await prisma.instanceSettings.update({
      where: { id: 1 },
      data: {
        registrationOpen: true,
        availableModules: ["KNOW", "GROW", "CONNECT", "LIFE"],
      },
    });
    await app.close();
  });

  it("exposes public instance settings without auth", async () => {
    const res = await http.get("/api/v1/instance/public").expect(200);
    expect(res.body).toEqual({
      name: expect.any(String),
      registrationOpen: true,
      defaultLocale: "en",
      mailEnabled: true, // .env sets SMTP_HOST (Mailpit)
      theme: {
        brandPrimary: null,
        brandSecondary: null,
        fontKey: null,
        radiusKey: null,
        glassKey: null,
      },
    });
  });

  it("rejects god-mode routes for a tenant ADMIN that is not superadmin", async () => {
    const admin = await prisma.user.create({
      data: {
        email: `plain-admin-${ts}@x.com`,
        passwordHash: "x",
        firstName: "Plain",
        lastName: "Admin",
        role: "ADMIN",
        organizationId: superOrgId,
      },
    });
    const token = await signToken(app, admin.id);
    await http.get("/api/v1/instance/settings").set(auth(token)).expect(403);
  });

  it("superadmin creates an organization; its admin accepts the emailed invitation", async () => {
    const res = await http
      .post("/api/v1/instance/organizations")
      .set(auth(superToken))
      .send({
        name: `Tenant ${ts}`,
        timezone: "America/Lima",
        admin: { email: tenantAdminEmail, firstName: "Ten", lastName: "Admin" },
      })
      .expect(201);
    expect(res.body.inviteSent).toBe(true);
    tenantId = res.body.organization.id;

    // Invitation pending: no password works yet
    await http
      .post("/api/v1/auth/login")
      .send({ email: tenantAdminEmail, password: PASSWORD })
      .expect(401);

    const token = await tokenFromMail(tenantAdminEmail);
    const accepted = await http
      .post("/api/v1/auth/set-password")
      .send({ token, password: PASSWORD })
      .expect(200);
    expect(accepted.body.user.organization.id).toBe(tenantId);
    expect(accepted.body.user.modules).toEqual([
      "KNOW",
      "GROW",
      "CONNECT",
      "LIFE",
    ]);

    // Links are single-use
    await http
      .post("/api/v1/auth/set-password")
      .send({ token, password: PASSWORD })
      .expect(400);
    tenantAdminToken = accepted.body.accessToken;
  });

  it("tenant admin disables a module and its routes return 403", async () => {
    await http
      .get("/api/v1/connect/directory")
      .set(auth(tenantAdminToken))
      .expect(200);

    const res = await http
      .patch("/api/v1/org")
      .set(auth(tenantAdminToken))
      .send({ enabledModules: ["KNOW"] })
      .expect(200);
    expect(res.body.enabledModules).toEqual(["KNOW"]);

    await http
      .get("/api/v1/connect/directory")
      .set(auth(tenantAdminToken))
      .expect(403);
    await http
      .get("/api/v1/know/spaces")
      .set(auth(tenantAdminToken))
      .expect(200);
  });

  it("instance availableModules caps what organizations can use", async () => {
    await http
      .patch("/api/v1/instance/settings")
      .set(auth(superToken))
      .send({ availableModules: ["GROW"] })
      .expect(200);

    await http
      .get("/api/v1/know/spaces")
      .set(auth(tenantAdminToken))
      .expect(403);
    await http
      .patch("/api/v1/org")
      .set(auth(tenantAdminToken))
      .send({ enabledModules: ["KNOW", "LIFE"] })
      .expect(400);

    await http
      .patch("/api/v1/instance/settings")
      .set(auth(superToken))
      .send({ availableModules: ["KNOW", "GROW", "CONNECT", "LIFE"] })
      .expect(200);
    await http
      .get("/api/v1/know/spaces")
      .set(auth(tenantAdminToken))
      .expect(200);
  });

  it("tenant admin invites a member, cannot edit themselves, and can deactivate the member", async () => {
    const created = await http
      .post("/api/v1/org/members")
      .set(auth(tenantAdminToken))
      .send({
        email: memberEmail,
        firstName: "Mem",
        lastName: "Ber",
        role: "COLLABORATOR",
      })
      .expect(201);
    expect(created.body).toMatchObject({
      inviteSent: true,
      member: { invitationPending: true },
    });
    const memberId = created.body.member.id;

    const token = await tokenFromMail(memberEmail);
    const accepted = await http
      .post("/api/v1/auth/set-password")
      .send({ token, password: PASSWORD })
      .expect(200);
    const memberToken = accepted.body.accessToken;

    // Collaborators cannot manage the organization
    await http.get("/api/v1/org/members").set(auth(memberToken)).expect(403);

    const self = await prisma.user.findUniqueOrThrow({
      where: { email: tenantAdminEmail },
    });
    await http
      .patch(`/api/v1/org/members/${self.id}`)
      .set(auth(tenantAdminToken))
      .send({ role: "COLLABORATOR" })
      .expect(400);

    // Members of other organizations are not reachable
    const otherOrgUser = await prisma.user.findFirstOrThrow({
      where: { organizationId: superOrgId },
    });
    await http
      .patch(`/api/v1/org/members/${otherOrgUser.id}`)
      .set(auth(tenantAdminToken))
      .send({ isActive: false })
      .expect(404);

    await http
      .patch(`/api/v1/org/members/${memberId}`)
      .set(auth(tenantAdminToken))
      .send({ isActive: false })
      .expect(200);
    await http.get("/api/v1/auth/me").set(auth(memberToken)).expect(401);
  });

  it("password reset: no account enumeration, emailed link works", async () => {
    await http
      .post("/api/v1/auth/forgot-password")
      .send({ email: `nobody-${ts}@x.com` })
      .expect(204);
    await http
      .post("/api/v1/auth/forgot-password")
      .send({ email: tenantAdminEmail })
      .expect(204);

    // The reset email goes out after the answer; the invitation is already in the inbox.
    const token = await tokenFromMail(tenantAdminEmail, 2);
    const res = await http
      .post("/api/v1/auth/set-password")
      .send({ token, password: "Bright-meadow-2026" })
      .expect(200);
    tenantAdminToken = res.body.accessToken;
    tenantAdminRefresh = setCookie(res, "cluster_session")!;
    await http
      .post("/api/v1/auth/login")
      .send({ email: tenantAdminEmail, password: PASSWORD })
      .expect(401);
  });

  it("refresh tokens cannot be used as access tokens", async () => {
    await http.get("/api/v1/auth/me").set(auth(tenantAdminToken)).expect(200);
    await http.get("/api/v1/auth/me").set(auth(tenantAdminRefresh)).expect(401);
  });

  it("closing registration blocks public sign-up", async () => {
    await http
      .patch("/api/v1/instance/settings")
      .set(auth(superToken))
      .send({ registrationOpen: false })
      .expect(200);
    await http
      .post("/api/v1/auth/register")
      .send({
        email: `signup-${ts}@x.com`,
        password: PASSWORD,
        firstName: "Sign",
        lastName: "Up",
        organizationName: `Signup ${ts}`,
      })
      .expect(403);
  });

  it("superadmin suspends an organization: its members cannot sign in", async () => {
    await http
      .patch(`/api/v1/instance/organizations/${superOrgId}`)
      .set(auth(superToken))
      .send({ isActive: false })
      .expect(400);

    await http
      .patch(`/api/v1/instance/organizations/${tenantId}`)
      .set(auth(superToken))
      .send({ isActive: false })
      .expect(200);
    await http.get("/api/v1/auth/me").set(auth(tenantAdminToken)).expect(401);
    await http
      .post("/api/v1/auth/login")
      .send({ email: tenantAdminEmail, password: "Bright-meadow-2026" })
      .expect(403);

    const list = await http
      .get("/api/v1/instance/organizations")
      .set(auth(superToken))
      .expect(200);
    expect(
      list.body.find((o: { id: string }) => o.id === tenantId),
    ).toMatchObject({
      isActive: false,
      memberCount: 2,
    });
  });
});
