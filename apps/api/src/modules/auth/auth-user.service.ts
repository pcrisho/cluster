import { Injectable, UnauthorizedException } from "@nestjs/common";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import {
  effectiveModules,
  loadInstanceSettings,
} from "../../common/instance-settings";
import { effectiveLocale } from "../../common/locale";
import { sessionEnded } from "./session-limits";
import type { AuthenticatedUser } from "../../common/decorators";

/**
 * Builds the request principal from the DB, so role, status, module changes and a revoked session apply
 * immediately. Runs before any organization context exists, hence the system client. The session is read
 * in the same query as the user.
 */
@Injectable()
export class AuthUserService {
  constructor(private readonly prisma: SystemPrismaService) {}

  /** `sessionId` is the token's `sid`; only collab's internal recheck (a user id, no token) omits it. */
  async load(userId: string, sessionId?: string): Promise<AuthenticatedUser> {
    const [user, settings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          isSuperAdmin: true,
          locale: true,
          organizationId: true,
          organization: {
            select: { isActive: true, enabledModules: true, locale: true },
          },
          capabilities: { select: { capability: true } },
          authSessions: {
            where: { id: sessionId ?? "" },
            select: {
              revokedAt: true,
              idleExpiresAt: true,
              absoluteExpiresAt: true,
            },
            take: sessionId ? 1 : 0,
          },
        },
      }),
      loadInstanceSettings(this.prisma),
    ]);

    if (!user) {
      throw new UnauthorizedException("User no longer exists");
    }
    if (
      sessionId &&
      (!user.authSessions[0] || sessionEnded(user.authSessions[0], new Date()))
    ) {
      throw new UnauthorizedException({
        code: "SESSION_ENDED",
        message: "The session has ended, sign in again",
      });
    }
    if (!user.isActive) {
      throw new UnauthorizedException({
        code: "ACCOUNT_INACTIVE",
        message: "Account is deactivated",
      });
    }
    if (!user.organization.isActive) {
      throw new UnauthorizedException({
        code: "ORG_SUSPENDED",
        message: "Organization is suspended",
      });
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      orgId: user.organizationId,
      isSuperAdmin: user.isSuperAdmin,
      modules: effectiveModules(
        settings.availableModules,
        user.organization.enabledModules,
      ),
      capabilities: user.capabilities.map((c) => c.capability),
      locale: effectiveLocale(
        user.locale,
        user.organization.locale,
        settings.defaultLocale,
      ),
      ...(sessionId && { sessionId }),
    };
  }
}
