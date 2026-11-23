import { Injectable } from "@nestjs/common";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { sha256 } from "./auth-tokens";

export type AuthEventType =
  | "LOGIN_OK"
  | "LOGIN_FAILED"
  | "REFRESH_REUSE"
  | "LOGOUT"
  | "PASSWORD_CHANGED"
  | "PASSWORD_RESET"
  | "INVITE_ACCEPTED"
  | "BREACH_CHECK_UNAVAILABLE"
  | "LOGIN_LOCKED"
  | "MFA_VERIFIED"
  | "MFA_FAILED"
  | "MFA_ENABLED"
  | "MFA_DISABLED"
  | "MFA_RESET"
  | "MFA_CHANGED"
  | "SESSION_CLOSED"
  | "OTHER_SESSIONS_CLOSED"
  | "RECOVERY_CODE_USED"
  | "RECOVERY_CODES_RENEWED"
  // An operator printed an access link (src/scripts/access-link.ts).
  | "ACCESS_LINK_ISSUED";

export interface AuthEventInput {
  userId?: string | null;
  /** For an attempt on an unknown account: only its hash is kept. */
  email?: string;
  sessionId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  /** Reason and context; never a password or a token. */
  detail?: Record<string, string>;
}

/**
 * Writes auth_events (docs/specs/auth/hardening R-30): not audit_log, which needs an actor a failed
 * sign-in may not have. The system client only; the app role has no privilege on the table.
 */
@Injectable()
export class AuthEventsService {
  constructor(private readonly prisma: SystemPrismaService) {}

  async record(type: AuthEventType, input: AuthEventInput): Promise<void> {
    await this.prisma.authEvent.create({
      data: {
        type,
        userId: input.userId ?? null,
        emailHash: input.email
          ? sha256(input.email.trim().toLowerCase())
          : null,
        sessionId: input.sessionId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        ...(input.detail && { detail: input.detail }),
      },
    });
  }
}
