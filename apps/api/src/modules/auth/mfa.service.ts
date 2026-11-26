import { ConflictException, Injectable } from "@nestjs/common";
import * as QRCode from "qrcode";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { sha256 } from "./auth-tokens";
import { AuthKeys } from "./auth-keys";
import { open, seal } from "./secret-box";
import {
  checkTotp,
  newRecoveryCode,
  newTotpSecret,
  normalizeRecoveryCode,
  totpUri,
} from "./totp";

const RECOVERY_CODES = 10;
/** How long a new device may wait for its first code while the old one stays on. */
const PENDING_MS = 15 * 60_000;

/** Who may not go without 2FA (R-19): the superadmin, and an ADMIN whose organization requires it. */
export const mfaRequired = (user: {
  isSuperAdmin: boolean;
  role: string;
  organization: { requireAdminMfa: boolean };
}) =>
  user.isSuperAdmin ||
  (user.role === "ADMIN" && user.organization.requireAdminMfa);
const formatRecovery = (code: string) => `${code.slice(0, 5)}-${code.slice(5)}`;

/**
 * TOTP second factor and recovery codes (docs/specs/auth/hardening D-04). The secret is sealed with a key
 * derived from AUTH_SECRET_KEY; recovery codes are kept as hashes. Not tenant data: the system client only.
 */
@Injectable()
export class MfaService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: SystemPrismaService,
    keys: AuthKeys,
  ) {
    this.key = keys.derive("mfa-secret");
  }

  async isEnabled(userId: string): Promise<boolean> {
    const mfa = await this.prisma.userMfa.findUnique({
      where: { userId },
      select: { confirmedAt: true },
    });
    return !!mfa?.confirmedAt;
  }

  /** Which of these people have 2FA on (the members list, which the app role cannot join to user_mfa). */
  async enabledAmong(userIds: string[]): Promise<Set<string>> {
    const rows = await this.prisma.userMfa.findMany({
      where: { userId: { in: userIds }, confirmedAt: { not: null } },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  /** A new secret to scan; replaces an enrollment left unconfirmed. Refused while 2FA is on. */
  async startEnrollment(userId: string, label: string, issuer: string) {
    if (await this.isEnabled(userId))
      throw new ConflictException({
        code: "MFA_ALREADY_ENABLED",
        message: "Two-step verification is already on",
      });
    const secret = newTotpSecret();
    const secretBox = seal(secret, this.key);
    await this.prisma.userMfa.upsert({
      where: { userId },
      create: { userId, secretBox },
      update: {
        secretBox,
        confirmedAt: null,
        lastStep: null,
        createdAt: new Date(),
        pendingSecretBox: null,
        pendingAt: null,
      },
    });
    return this.toScan(secret, label, issuer);
  }

  /** A new device for 2FA that is on: the current one keeps working until the new one is confirmed. */
  async startReplacement(userId: string, label: string, issuer: string) {
    const secret = newTotpSecret();
    const { count } = await this.prisma.userMfa.updateMany({
      where: { userId, confirmedAt: { not: null } },
      data: { pendingSecretBox: seal(secret, this.key), pendingAt: new Date() },
    });
    if (count === 0)
      throw new ConflictException({
        code: "MFA_NOT_ENABLED",
        message: "Two-step verification is off",
      });
    return this.toScan(secret, label, issuer);
  }

  /** Swaps in the new device with its first valid code; returns new recovery codes. Null for a wrong code. */
  async confirmReplacement(
    userId: string,
    code: string,
  ): Promise<string[] | null> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa?.confirmedAt || !mfa.pendingSecretBox || !mfa.pendingAt)
      return null;
    if (Date.now() - mfa.pendingAt.getTime() > PENDING_MS) return null;
    const step = checkTotp(open(mfa.pendingSecretBox, this.key), code, null);
    if (step === null) return null;
    // Conditional on the same pending box, so two confirmations cannot both swap.
    const { count } = await this.prisma.userMfa.updateMany({
      where: { userId, pendingSecretBox: mfa.pendingSecretBox },
      data: {
        secretBox: mfa.pendingSecretBox,
        lastStep: step,
        confirmedAt: new Date(),
        pendingSecretBox: null,
        pendingAt: null,
      },
    });
    if (count === 0) return null;
    return this.replaceRecoveryCodes(userId);
  }

  private async toScan(secret: string, label: string, issuer: string) {
    const otpauthUrl = totpUri(issuer, label, secret);
    return {
      secret,
      otpauthUrl,
      qrSvg: await QRCode.toString(otpauthUrl, { type: "svg", margin: 1 }),
    };
  }

  /** Turns 2FA on with a first valid code; returns the recovery codes, shown once. Null for a wrong code. */
  async confirmEnrollment(
    userId: string,
    code: string,
  ): Promise<string[] | null> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa || mfa.confirmedAt) return null;
    const step = checkTotp(open(mfa.secretBox, this.key), code, null);
    if (step === null) return null;
    await this.prisma.userMfa.update({
      where: { userId },
      data: { confirmedAt: new Date(), lastStep: step },
    });
    return this.replaceRecoveryCodes(userId);
  }

  /** A valid code of a confirmed enrollment, accepted once (the step is claimed in the same update). */
  async verify(userId: string, code: string): Promise<boolean> {
    const mfa = await this.prisma.userMfa.findUnique({ where: { userId } });
    if (!mfa?.confirmedAt) return false;
    const step = checkTotp(open(mfa.secretBox, this.key), code, mfa.lastStep);
    if (step === null) return false;
    const { count } = await this.prisma.userMfa.updateMany({
      where: { userId, OR: [{ lastStep: null }, { lastStep: { lt: step } }] },
      data: { lastStep: step },
    });
    return count > 0;
  }

  /** Spends one recovery code; false if unknown or used. */
  async useRecoveryCode(userId: string, input: string): Promise<boolean> {
    const { count } = await this.prisma.mfaRecoveryCode.updateMany({
      where: {
        userId,
        codeHash: sha256(normalizeRecoveryCode(input)),
        usedAt: null,
      },
      data: { usedAt: new Date() },
    });
    return count > 0;
  }

  async remainingRecoveryCodes(userId: string): Promise<number> {
    return this.prisma.mfaRecoveryCode.count({
      where: { userId, usedAt: null },
    });
  }

  /** New recovery codes (the old ones stop working); shown once. */
  async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODES }, newRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.mfaRecoveryCode.createMany({
        data: codes.map((code) => ({ userId, codeHash: sha256(code) })),
      }),
    ]);
    return codes.map(formatRecovery);
  }

  /** Turns 2FA off: the secret and the recovery codes go. */
  async remove(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.mfaRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.userMfa.deleteMany({ where: { userId } }),
    ]);
  }
}
