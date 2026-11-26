import { INestApplication } from "@nestjs/common";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { createActor, createTestApp } from "../../test-helpers";
import { MfaService } from "./mfa.service";
import { totpNow } from "./totp";

/** The pieces of 2FA against the real database (docs/specs/auth/hardening T18). */
describe("MfaService e2e", () => {
  let app: INestApplication;
  let mfa: MfaService;
  let prisma: SystemPrismaService;
  const now = () => Math.floor(Date.now() / 1000);

  beforeAll(async () => {
    app = await createTestApp();
    mfa = app.get(MfaService);
    prisma = app.get(SystemPrismaService);
  });
  afterAll(() => app.close());

  async function enrolled(name: string) {
    const actor = await createActor(app, name);
    const { secret } = await mfa.startEnrollment(
      actor.id,
      `${name}@x.com`,
      "Cluster",
    );
    const codes = await mfa.confirmEnrollment(actor.id, totpNow(secret));
    return { actor, secret, codes: codes! };
  }

  it("keeps the secret sealed in the database and hands out a scannable QR", async () => {
    const actor = await createActor(app, "sealed");
    const started = await mfa.startEnrollment(
      actor.id,
      "sealed@x.com",
      "Cluster",
    );
    expect(started.qrSvg).toMatch(/^<svg/);
    expect(started.otpauthUrl).toContain(`secret=${started.secret}`);
    const row = await prisma.userMfa.findUniqueOrThrow({
      where: { userId: actor.id },
    });
    expect(row.secretBox).not.toContain(started.secret);
    expect(row.confirmedAt).toBeNull();
    expect(await mfa.isEnabled(actor.id)).toBe(false);
  });

  it("turns on only with a valid code, and returns ten recovery codes stored as hashes", async () => {
    const actor = await createActor(app, "confirm");
    const { secret } = await mfa.startEnrollment(
      actor.id,
      "confirm@x.com",
      "Cluster",
    );
    expect(await mfa.confirmEnrollment(actor.id, "000000")).toBeNull();
    const codes = await mfa.confirmEnrollment(actor.id, totpNow(secret));
    expect(codes).toHaveLength(10);
    expect(codes![0]).toMatch(/^[0-9A-Z]{5}-[0-9A-Z]{5}$/);
    expect(await mfa.isEnabled(actor.id)).toBe(true);
    const stored = await prisma.mfaRecoveryCode.findMany({
      where: { userId: actor.id },
    });
    expect(JSON.stringify(stored)).not.toContain(codes![0].replace("-", ""));
    await expect(
      mfa.startEnrollment(actor.id, "confirm@x.com", "Cluster"),
    ).rejects.toMatchObject({
      response: { code: "MFA_ALREADY_ENABLED" },
    });
  });

  it("accepts a code once: the one used to turn it on, or any later one, never twice", async () => {
    const { actor, secret } = await enrolled("replay");
    expect(await mfa.verify(actor.id, totpNow(secret))).toBe(false);
    const next = totpNow(secret, now() + 30);
    expect(await mfa.verify(actor.id, next)).toBe(true);
    expect(await mfa.verify(actor.id, next)).toBe(false);
  });

  it("spends each recovery code once, whatever the case and dashes", async () => {
    const { actor, codes } = await enrolled("recovery");
    expect(await mfa.useRecoveryCode(actor.id, codes[0].toLowerCase())).toBe(
      true,
    );
    expect(await mfa.useRecoveryCode(actor.id, codes[0])).toBe(false);
    expect(await mfa.remainingRecoveryCodes(actor.id)).toBe(9);
    const other = await enrolled("recovery-other");
    expect(await mfa.useRecoveryCode(other.actor.id, codes[1])).toBe(false);
  });

  it("forgets the old recovery codes when new ones are made, and everything when turned off", async () => {
    const { actor, codes } = await enrolled("replace");
    const fresh = await mfa.replaceRecoveryCodes(actor.id);
    expect(await mfa.useRecoveryCode(actor.id, codes[0])).toBe(false);
    expect(await mfa.useRecoveryCode(actor.id, fresh[0])).toBe(true);
    await mfa.remove(actor.id);
    expect(await mfa.isEnabled(actor.id)).toBe(false);
    expect(
      await prisma.mfaRecoveryCode.count({ where: { userId: actor.id } }),
    ).toBe(0);
  });
});
