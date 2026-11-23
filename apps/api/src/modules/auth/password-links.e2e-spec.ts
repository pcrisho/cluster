import { INestApplication } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import request from "supertest";
import { hashPassword } from "./password-hash";
import { createHash } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createTestApp } from "../../test-helpers";

const MAILPIT_URL = process.env.MAILPIT_URL || "http://localhost:8025";

/** The set-password tokens of the newest `count` emails sent to `to`, newest first. */
async function tokensFromMail(to: string, count: number): Promise<string[]> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const { messages } = (await res.json()) as { messages: { ID: string }[] };
    if (messages.length >= count) {
      const tokens: string[] = [];
      for (const m of messages.slice(0, count)) {
        const msg = (await (
          await fetch(`${MAILPIT_URL}/api/v1/message/${m.ID}`)
        ).json()) as { Text: string };
        tokens.push(msg.Text.match(/set-password\?token=([\w-]+)/)![1]);
      }
      return tokens;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Fewer than ${count} emails received for ${to}`);
}

describe("Password links (invitations and resets) e2e", () => {
  let app: INestApplication;
  let prisma: SystemPrismaService;
  let http: ReturnType<typeof request>;

  async function member(name: string) {
    const slug = `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const org = await prisma.organization.create({
      data: { name: slug, slug },
    });
    const email = `${slug}@x.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword("Old-password-1", 4),
        firstName: name,
        lastName: "Link",
        organizationId: org.id,
      },
    });
    return { email, id: user.id };
  }
  const forgot = (email: string) =>
    http.post("/api/v1/auth/forgot-password").send({ email }).expect(204);
  const setPassword = (token: string, password = "New-password-1") =>
    http.post("/api/v1/auth/set-password").send({ token, password });

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

  it("stores only the hash of the link, in Postgres", async () => {
    const { email, id } = await member("hash");
    await forgot(email);
    const [token] = await tokensFromMail(email, 1);
    const row = await prisma.passwordLink.findUniqueOrThrow({
      where: { userId: id },
    });
    expect(row.tokenHash).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
    expect(row.purpose).toBe("RESET");
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("is single use", async () => {
    const { email } = await member("once");
    await forgot(email);
    const [token] = await tokensFromMail(email, 1);
    await setPassword(token).expect(200);
    expect((await setPassword(token).expect(400)).body.code).toBe(
      "LINK_INVALID",
    );
  });

  it("invalidates the previous link when a new one is sent", async () => {
    const { email } = await member("previous");
    await forgot(email);
    await tokensFromMail(email, 1);
    await forgot(email);
    const [newest, older] = await tokensFromMail(email, 2);
    expect((await setPassword(older).expect(400)).body.code).toBe(
      "LINK_INVALID",
    );
    await setPassword(newest).expect(200);
  });

  it("refuses an expired link", async () => {
    const { email, id } = await member("expired");
    await forgot(email);
    const [token] = await tokensFromMail(email, 1);
    await prisma.passwordLink.update({
      where: { userId: id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    expect((await setPassword(token).expect(400)).body.code).toBe(
      "LINK_INVALID",
    );
  });

  it("lets only one of two concurrent uses win", async () => {
    const { email } = await member("race");
    await forgot(email);
    const [token] = await tokensFromMail(email, 1);
    const results = await Promise.all([
      setPassword(token),
      setPassword(token),
      setPassword(token),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400, 400]);
  });

  it("keeps the link usable when the new password is refused", async () => {
    const { email } = await member("refused");
    await forgot(email);
    const [token] = await tokensFromMail(email, 1);
    expect((await setPassword(token, "too-short").expect(400)).body.code).toBe(
      "PASSWORD_TOO_SHORT",
    );
    await setPassword(token).expect(200);
  });
});
