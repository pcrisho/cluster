import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { createHash } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, type TestActor } from "../../test-helpers";
import { hashPassword } from "./password-hash";

const CURRENT = "Current-password-2026";
const HIBP = "https://api.pwnedpasswords.com/range/";

/** The HIBP switch (docs/specs/auth/hardening R-24): only the superadmin, audited; the service mocked. */
describe("Password breach check e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;
  let superAdmin: TestActor;
  const realFetch = global.fetch;

  /** Answers HIBP range requests with `hibp`, everything else (Mailpit) with the real fetch. */
  function mockHibp(hibp: (url: string) => Promise<Response>) {
    jest
      .spyOn(global, "fetch")
      .mockImplementation((input, init) =>
        String(input).startsWith(HIBP)
          ? hibp(String(input))
          : realFetch(input, init),
      );
  }
  const listing = (password: string, count: number) => {
    const hash = createHash("sha1")
      .update(password)
      .digest("hex")
      .toUpperCase();
    return async () =>
      new Response(
        `${hash.slice(5)}:${count}\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:0`,
      );
  };
  const setSwitch = (actor: TestActor, passwordBreachCheck: boolean) =>
    http
      .patch("/api/v1/instance/settings")
      .set(actor.auth)
      .send({ passwordBreachCheck });

  async function memberWithPassword(name: string) {
    const actor = await createActor(app, name);
    await prisma.user.update({
      where: { id: actor.id },
      data: { passwordHash: await hashPassword(CURRENT, 4) },
    });
    return actor;
  }
  const change = (actor: TestActor, newPassword: string) =>
    http
      .patch("/api/v1/auth/me/password")
      .set(actor.auth)
      .send({ currentPassword: CURRENT, newPassword });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(SystemPrismaService);
    http = request(app.getHttpServer());
    superAdmin = await createActor(app, "breach-super", "ADMIN");
    await prisma.user.update({
      where: { id: superAdmin.id },
      data: { isSuperAdmin: true },
    });
  });
  beforeEach(() =>
    jest.spyOn(ThrottlerGuard.prototype, "canActivate").mockResolvedValue(true),
  );
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await setSwitch(superAdmin, false);
    await app.close();
  });

  it("is off by default and only the superadmin turns it on, audited", async () => {
    expect(
      (
        await http
          .get("/api/v1/instance/settings")
          .set(superAdmin.auth)
          .expect(200)
      ).body.passwordBreachCheck,
    ).toBe(false);
    const admin = await createActor(app, "breach-admin", "ADMIN");
    await setSwitch(admin, true).expect(403);

    await setSwitch(superAdmin, true).expect(200);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        action: "InstanceSettings.SET_BREACH_CHECK",
        actorId: superAdmin.id,
      },
    });
    expect(audit).toMatchObject({
      organizationId: null,
      newValues: { passwordBreachCheck: true },
    });
  });

  it("refuses a breached password while on", async () => {
    await setSwitch(superAdmin, true).expect(200);
    const actor = await memberWithPassword("breached");
    mockHibp(listing("Leaked-but-long-2026", 1234));
    expect(
      (await change(actor, "Leaked-but-long-2026").expect(400)).body.code,
    ).toBe("PASSWORD_BREACHED");
  });

  it("accepts a password that only shows up as padding", async () => {
    await setSwitch(superAdmin, true).expect(200);
    const actor = await memberWithPassword("padding");
    mockHibp(listing("Fresh-and-unique-2026", 0));
    await change(actor, "Fresh-and-unique-2026").expect(200);
  });

  it("accepts the password and records it when the service does not answer", async () => {
    await setSwitch(superAdmin, true).expect(200);
    const actor = await memberWithPassword("offline");
    mockHibp(async () => {
      throw new Error("ENOTFOUND api.pwnedpasswords.com");
    });
    await change(actor, "Remote-island-2026").expect(200);
    const email = (
      await prisma.user.findUniqueOrThrow({ where: { id: actor.id } })
    ).email;
    const sha = createHash("sha256").update(email).digest("hex");
    expect(
      await prisma.authEvent.count({
        where: { type: "BREACH_CHECK_UNAVAILABLE", emailHash: sha },
      }),
    ).toBe(1);
  });

  it("does not ask the service while off", async () => {
    await setSwitch(superAdmin, false).expect(200);
    const actor = await memberWithPassword("switched-off");
    const hibp = jest.fn(listing("Leaked-but-long-2026", 99));
    mockHibp(hibp);
    await change(actor, "Leaked-but-long-2026").expect(200);
    expect(hibp).not.toHaveBeenCalled();
  });
});
