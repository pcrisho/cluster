import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp, WEB_ORIGIN } from "../../test-helpers";
import { hashPassword } from "./password-hash";

const PASSWORD = "Many-devices-2026";

/** A person's own sessions (docs/specs/auth/hardening T21, R-11): see them, close one, close the others. */
describe("Own sessions e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;

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
        firstName: "Many",
        lastName: "Devices",
        organizationId: org.id,
      },
    });
    return email;
  }
  /** A sign-in from one device: its bearer header. */
  const device = async (email: string, userAgent: string) => {
    const res = await http
      .post("/api/v1/auth/login")
      .set("Origin", WEB_ORIGIN)
      .set("User-Agent", userAgent)
      .send({ email, password: PASSWORD })
      .expect(200);
    return { Authorization: `Bearer ${res.body.accessToken}` };
  };
  type Listed = { id: string; current: boolean; userAgent: string };
  const list = async (auth: { Authorization: string }) =>
    (await http.get("/api/v1/auth/sessions").set(auth).expect(200))
      .body as Listed[];

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

  it("lists the live sessions, marks this one, and shows nothing secret", async () => {
    const email = await member("list");
    const laptop = await device(email, "Laptop browser");
    await device(email, "Old tablet"); // closed below: closed sessions are not listed
    await http
      .post("/api/v1/auth/sessions/close-others")
      .set(laptop)
      .expect(204);
    const phone = await device(email, "Phone browser");

    const sessions = await list(phone);
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((s) => s.current)).toEqual([
      expect.objectContaining({ userAgent: "Phone browser" }),
    ]);
    expect(Object.keys(sessions[0]).sort()).toEqual(
      [
        "createdAt",
        "current",
        "id",
        "ipAddress",
        "lastUsedAt",
        "userAgent",
      ].sort(),
    );
  });

  it("closes one session, which stops working at once, and records it", async () => {
    const email = await member("close");
    const laptop = await device(email, "Laptop browser");
    const phone = await device(email, "Phone browser");
    const target = (await list(laptop)).find((s) => !s.current)!;

    await http
      .delete(`/api/v1/auth/sessions/${target.id}`)
      .set(laptop)
      .expect(204);
    await http.get("/api/v1/auth/me").set(phone).expect(401);
    await http.get("/api/v1/auth/me").set(laptop).expect(200);
    expect(await list(laptop)).toHaveLength(1);
    expect(
      await prisma.authEvent.count({
        where: { sessionId: target.id, type: "SESSION_CLOSED" },
      }),
    ).toBe(1);
  });

  it("closes the others and keeps this one", async () => {
    const email = await member("others");
    const laptop = await device(email, "Laptop browser");
    const phone = await device(email, "Phone browser");
    const tablet = await device(email, "Tablet browser");

    await http
      .post("/api/v1/auth/sessions/close-others")
      .set(laptop)
      .expect(204);
    await http.get("/api/v1/auth/me").set(phone).expect(401);
    await http.get("/api/v1/auth/me").set(tablet).expect(401);
    await http.get("/api/v1/auth/me").set(laptop).expect(200);
    expect(await list(laptop)).toEqual([
      expect.objectContaining({ current: true }),
    ]);
  });

  it("never shows or closes another person's session", async () => {
    const mine = await device(await member("mine"), "Mine");
    const theirs = await createActor(app, "theirs");
    const [theirSession] = await list(theirs.auth);

    expect((await list(mine)).map((s) => s.id)).not.toContain(theirSession.id);
    await http
      .delete(`/api/v1/auth/sessions/${theirSession.id}`)
      .set(mine)
      .expect(404);
    await http.get("/api/v1/auth/me").set(theirs.auth).expect(200);
  });
});
