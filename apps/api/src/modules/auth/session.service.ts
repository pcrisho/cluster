import { Injectable } from "@nestjs/common";
import { bestEffort } from "../../common/best-effort";
import { randomUUID } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { newRefreshToken, parseRefreshToken } from "./auth-tokens";
import { extendedIdle, newExpiry, refreshDecision } from "./session-limits";

export type RevokeReason =
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "REUSE"
  | "DEACTIVATED"
  | "EMAIL_CHANGED"
  | "MFA_CHANGED"
  | "MANUAL"
  | "OTHERS_CLOSED";

/** What a refresh needs to know about the session it kept alive. */
export interface SessionRef {
  id: string;
  userId: string;
  superAdmin: boolean;
  absoluteExpiresAt: Date;
}

export type RotateResult =
  | { kind: "rotated"; session: SessionRef; refreshToken: string }
  /** Not a session token of ours: malformed, unknown session, or a hash that matches neither. */
  | { kind: "unknown" }
  /** Revoked or past a limit. */
  | { kind: "ended"; userId: string }
  /** A rotated token came back after the grace window: every session of the person was revoked. */
  | { kind: "reuse"; userId: string; sessionId: string };

/** Sessions that just ended: one (`sessionId`), or every one of the person except `except`. */
export interface RevokedSessions {
  userId: string;
  sessionId?: string;
  except?: string;
}

const REF = {
  id: true,
  userId: true,
  superAdmin: true,
  absoluteExpiresAt: true,
} as const;

/**
 * Sessions in Postgres (docs/specs/auth/hardening, D-02). Not tenant data: the system client, and the
 * app role has no privilege on the table. Rotation is a conditional update, so a refresh token never
 * yields two sessions.
 */
@Injectable()
export class SessionService {
  private readonly revokeListeners: ((revoked: RevokedSessions) => unknown)[] =
    [];

  constructor(private readonly prisma: SystemPrismaService) {}

  /**
   * Called after sessions end, so whoever holds a live connection for them (sockets, collab) closes it.
   * Core features register here instead of being imported by auth.
   */
  onRevoke(listener: (revoked: RevokedSessions) => unknown) {
    this.revokeListeners.push(listener);
  }

  private async revoked(revoked: RevokedSessions) {
    for (const listener of this.revokeListeners)
      await bestEffort("session revoke listener", () => listener(revoked));
  }

  async create(input: {
    userId: string;
    superAdmin: boolean;
    userAgent?: string | null;
    ipAddress?: string | null;
  }): Promise<{ session: SessionRef; refreshToken: string }> {
    const now = new Date();
    const id = randomUUID();
    const { token, hash } = newRefreshToken(id);
    // Keeps one person's rows short; people who never sign in again are cleared by the auth:sweep command.
    await this.prisma.authSession.deleteMany({
      where: { userId: input.userId, absoluteExpiresAt: { lt: now } },
    });
    const session = await this.prisma.authSession.create({
      data: {
        id,
        userId: input.userId,
        superAdmin: input.superAdmin,
        refreshHash: hash,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        ipAddress: input.ipAddress ?? null,
        ...newExpiry(now, input.superAdmin),
      },
      select: REF,
    });
    return { session, refreshToken: token };
  }

  async rotate(token: unknown, retried = false): Promise<RotateResult> {
    const parsed = parseRefreshToken(token);
    if (!parsed) return { kind: "unknown" };
    const now = new Date();
    const session = await this.prisma.authSession.findUnique({
      where: { id: parsed.sid },
    });
    if (!session) return { kind: "unknown" };
    const matched =
      session.refreshHash === parsed.hash
        ? "current"
        : session.previousRefreshHash === parsed.hash
          ? "previous"
          : null;
    if (!matched) return { kind: "unknown" };

    const decision = refreshDecision(session, matched, now);
    if (decision === "ended") return { kind: "ended", userId: session.userId };
    if (decision === "reuse") {
      await this.revokeAll(session.userId, "REUSE");
      return { kind: "reuse", userId: session.userId, sessionId: session.id };
    }

    const next = newRefreshToken(session.id);
    const used = {
      refreshHash: next.hash,
      lastUsedAt: now,
      idleExpiresAt: extendedIdle(now, session),
    };
    // The current token becomes the previous one; within the grace window the previous one stays put,
    // so every request that carried it (a lost response, two tabs) still finds the session.
    const { count } = await this.prisma.authSession.updateMany({
      where:
        matched === "current"
          ? { id: session.id, refreshHash: parsed.hash, revokedAt: null }
          : {
              id: session.id,
              previousRefreshHash: parsed.hash,
              revokedAt: null,
            },
      data:
        matched === "current"
          ? { ...used, previousRefreshHash: parsed.hash, rotatedAt: now }
          : used,
    });
    if (count === 0) {
      // Another request rotated it first: the token is the previous one now. Revoked meanwhile: ended.
      return retried
        ? { kind: "ended", userId: session.userId }
        : this.rotate(token, true);
    }
    const { id, userId, superAdmin, absoluteExpiresAt } = session;
    return {
      kind: "rotated",
      session: { id, userId, superAdmin, absoluteExpiresAt },
      refreshToken: next.token,
    };
  }

  /** Ends the session a refresh token (current or previous) belongs to; null for anything else. */
  async revokeByToken(
    token: unknown,
    reason: RevokeReason,
  ): Promise<{ id: string; userId: string } | null> {
    const parsed = parseRefreshToken(token);
    if (!parsed) return null;
    const { count } = await this.prisma.authSession.updateMany({
      where: {
        id: parsed.sid,
        revokedAt: null,
        OR: [
          { refreshHash: parsed.hash },
          { previousRefreshHash: parsed.hash },
        ],
      },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    if (count === 0) return null;
    return { id: parsed.sid, userId: await this.notifyOne(parsed.sid) };
  }

  /** A person's live sessions, newest use first; nothing secret (R-11). */
  async listLive(userId: string) {
    const now = new Date();
    return this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        idleExpiresAt: { gt: now },
        absoluteExpiresAt: { gt: now },
      },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        userAgent: true,
        ipAddress: true,
      },
      orderBy: { lastUsedAt: "desc" },
    });
  }

  /** Ends one session (only if it is `userId`'s, when given); false when it was not live. */
  async revoke(
    sessionId: string,
    reason: RevokeReason,
    userId?: string,
  ): Promise<boolean> {
    const { count } = await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null, ...(userId && { userId }) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    if (count > 0) await this.notifyOne(sessionId);
    return count > 0;
  }

  /** Tells the listeners one session ended; returns whose it was. */
  private async notifyOne(sessionId: string): Promise<string> {
    const { userId } = await this.prisma.authSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { userId: true },
    });
    await this.revoked({ userId, sessionId });
    return userId;
  }

  /** Ends every live session of a person, except `keep` (the device that asked for it). */
  async revokeAll(
    userId: string,
    reason: RevokeReason,
    keep?: string,
  ): Promise<number> {
    const { count } = await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null, ...(keep && { id: { not: keep } }) },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    if (count > 0) await this.revoked({ userId, except: keep });
    return count;
  }
}
