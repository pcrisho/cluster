import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { sha256 } from "./auth-tokens";
import { AuthKeys } from "./auth-keys";
import {
  afterFailure,
  ipBlockedFor,
  lockedFor,
  type LockState,
} from "./lockout";

export type SignInBlock = {
  scope: "account" | "address";
  retryAfterMs: number;
};

const emailKey = (email: string) =>
  `email:${sha256(email.trim().toLowerCase())}`;
const ipKey = (ip: string) => `ip:${ip}`;

/**
 * Failed sign-in counters in `login_throttle` (docs/specs/auth/hardening R-25 to R-27): per account from
 * any address (lockout.ts), and a ceiling per address that only failures count. Postgres, not Redis: losing
 * it must not reopen the door. Not tenant data: the system client only.
 */
@Injectable()
export class LoginThrottleService {
  private readonly wrongKey: Buffer;
  private readonly ipLimit: number;

  constructor(
    private readonly prisma: SystemPrismaService,
    keys: AuthKeys,
    config: ConfigService,
  ) {
    this.wrongKey = keys.derive("login-wrong");
    this.ipLimit = Number(config.get<string>("AUTH_LOGIN_IP_FAILURES") || 100);
  }

  /** Whether a sign-in must be refused before the password is even checked. */
  async blocked(
    email: string,
    ip: string | null | undefined,
  ): Promise<SignInBlock | null> {
    const now = new Date();
    const rows = await this.prisma.loginThrottle.findMany({
      where: {
        key: { in: ip ? [emailKey(email), ipKey(ip)] : [emailKey(email)] },
      },
    });
    const address = ip
      ? ipBlockedFor(
          rows.find((r) => r.key === ipKey(ip)) ?? null,
          this.ipLimit,
          now,
        )
      : 0;
    if (address > 0) return { scope: "address", retryAfterMs: address };
    const account = lockedFor(
      rows.find((r) => r.key === emailKey(email)) ?? null,
      now,
    );
    return account > 0 ? { scope: "account", retryAfterMs: account } : null;
  }

  /** Counts a failed attempt; true when it just locked the account. */
  async failed(
    email: string,
    ip: string | null | undefined,
    password: string,
  ): Promise<boolean> {
    // A keyed hash: a wrong password is often close to the right one, so it is never stored as is.
    const fingerprint = createHmac("sha256", this.wrongKey)
      .update(password)
      .digest("base64url");
    if (ip) await this.bump(ipKey(ip), null);
    const { before, after } = await this.bump(emailKey(email), fingerprint);
    return after.lastLockAt?.getTime() !== before.lastLockAt?.getTime();
  }

  /** A correct password clears the account's failures (the lock level decays on its own after a day). */
  async succeeded(email: string): Promise<void> {
    await this.prisma.loginThrottle.updateMany({
      where: { key: emailKey(email) },
      data: { failures: 0, recentWrong: [] },
    });
  }

  /** Read, update and write one counter under a row lock, so concurrent failures are all counted. */
  private bump(
    key: string,
    fingerprint: string | null,
  ): Promise<{ before: LockState; after: LockState }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.loginThrottle.upsert({
        where: { key },
        create: { key },
        update: {},
      });
      const [row] = await tx.$queryRaw<LockState[]>`
        SELECT "failures", "windowStart", "lockedUntil", "lockLevel", "lastLockAt", "recentWrong"
        FROM login_throttle WHERE "key" = ${key} FOR UPDATE`;
      const after = afterFailure(row, fingerprint, new Date());
      await tx.loginThrottle.update({ where: { key }, data: after });
      return { before: row, after };
    });
  }
}
