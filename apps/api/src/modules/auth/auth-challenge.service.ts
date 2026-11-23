import { HttpException, HttpStatus, Injectable } from "@nestjs/common";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import type { ClientMeta } from "./auth.service";

/**
 * VERIFY: enter a code of the 2FA already on. ENROLL: set 2FA up before getting any session.
 * PASSWORD_CHANGE: the person signed in with an initial password and must set their own first.
 */
export type ChallengePurpose = "VERIFY" | "ENROLL" | "PASSWORD_CHANGE";

const LIFETIME_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

export const challengeEnded = () =>
  new HttpException(
    {
      code: "CHALLENGE_ENDED",
      message: "This sign-in step has ended, sign in again",
    },
    HttpStatus.GONE,
  );

/**
 * The short-lived step between a correct password and a session (docs/specs/auth/hardening R-17, R-18):
 * 5 minutes, one use, 5 attempts. It grants nothing by itself. Not tenant data: the system client only.
 */
@Injectable()
export class AuthChallengeService {
  constructor(private readonly prisma: SystemPrismaService) {}

  async create(
    userId: string,
    purpose: ChallengePurpose,
    client: ClientMeta,
  ): Promise<string> {
    const now = Date.now();
    await this.prisma.authChallenge.deleteMany({
      where: {
        userId,
        OR: [{ expiresAt: { lt: new Date(now) } }, { usedAt: { not: null } }],
      },
    });
    const { id } = await this.prisma.authChallenge.create({
      data: {
        userId,
        purpose,
        expiresAt: new Date(now + LIFETIME_MS),
        userAgent: client.userAgent?.slice(0, 500) ?? null,
        ipAddress: client.ipAddress ?? null,
      },
      select: { id: true },
    });
    return id;
  }

  /**
   * The person a live challenge of that purpose belongs to, or CHALLENGE_ENDED. `spend` counts one
   * attempt first, in the same conditional update, so concurrent guesses cannot exceed the limit.
   */
  async attempt(
    id: string,
    purpose: ChallengePurpose,
    spend = true,
  ): Promise<string> {
    const live = {
      id,
      purpose,
      usedAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    };
    if (spend) {
      const { count } = await this.prisma.authChallenge.updateMany({
        where: live,
        data: { attempts: { increment: 1 } },
      });
      if (count === 0) throw challengeEnded();
    }
    const challenge = await this.prisma.authChallenge.findFirst({
      where: spend ? { id } : live,
      select: { userId: true },
    });
    if (!challenge) throw challengeEnded();
    return challenge.userId;
  }

  /** Spends the challenge; only the first caller gets past it. */
  async finish(id: string): Promise<void> {
    const { count } = await this.prisma.authChallenge.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count === 0) throw challengeEnded();
  }
}
