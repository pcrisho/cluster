import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomBytes } from "crypto";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { sha256 } from "./auth-tokens";
import { UNUSABLE_PASSWORD } from "./password-hash";

export type LinkPurpose = "INVITE" | "RESET";

/**
 * Single-use "set your password" links (invitations and resets) in `password_links`: one live link per
 * person, stored as the SHA-256 of the token. Not tenant data: the system client only.
 */
@Injectable()
export class PasswordLinksService {
  constructor(private readonly prisma: SystemPrismaService) {}

  /** A new link for the person; the previous one, if any, stops working. Returns the token for the email. */
  async issue(
    userId: string,
    purpose: LinkPurpose,
    ttlSeconds: number,
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const data = {
      tokenHash: sha256(token),
      purpose,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
      createdAt: new Date(),
    };
    // One credential at a time: an INVITE link replaces a pending member's initial password in the same step.
    // A RESET link (forgot password) leaves it: whoever knows the address must not void a password an ADMIN
    // handed over; the link goes to the person's own mailbox and using it ends the initial password.
    await this.prisma.$transaction([
      this.prisma.passwordLink.upsert({
        where: { userId },
        create: { userId, ...data },
        update: data,
      }),
      ...(purpose === "INVITE"
        ? [
            this.prisma.user.updateMany({
              where: { id: userId, tempPasswordExpiresAt: { not: null } },
              data: {
                passwordHash: UNUSABLE_PASSWORD,
                tempPasswordExpiresAt: null,
              },
            }),
          ]
        : []),
    ]);
    return token;
  }

  /** An initial password (already hashed) that lasts until `expiresAt`; any link the person had stops working. */
  async issueInitialPassword(
    userId: string,
    passwordHash: string,
    expiresAt: Date,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.passwordLink.deleteMany({ where: { userId } }),
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash, tempPasswordExpiresAt: expiresAt },
      }),
    ]);
  }

  /** Whom a live token was issued for, without consuming it (to validate a new password first). */
  async peek(token: string): Promise<string | null> {
    const link = await this.prisma.passwordLink.findUnique({
      where: { tokenHash: sha256(token) },
      select: { userId: true, expiresAt: true },
    });
    return link && link.expiresAt > new Date() ? link.userId : null;
  }

  /** Whom and what the token was issued for, consuming it; null if unknown, used or expired. */
  async consume(
    token: string,
  ): Promise<{ userId: string; purpose: LinkPurpose } | null> {
    try {
      // Deleting by key lets exactly one of several concurrent uses win.
      const link = await this.prisma.passwordLink.delete({
        where: { tokenHash: sha256(token) },
      });
      return link.expiresAt > new Date()
        ? { userId: link.userId, purpose: link.purpose as LinkPurpose }
        : null;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2025"
      )
        return null;
      throw e;
    }
  }
}
