import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from "@nestjs/common";
import type { Capability, ModuleKey, UserRole } from "@prisma/client";
import type { Locale } from "./locale";

/** Shape of `request.user`, built by JwtStrategy on every authenticated request. */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  orgId: string;
  isSuperAdmin: boolean;
  /** Effective modules: instance availableModules ∩ organization enabledModules. */
  modules: ModuleKey[];
  /** Organization-wide permissions an admin granted to this person. */
  capabilities: Capability[];
  /** Effective language: the person's choice, else the instance default (common/locale.ts). */
  locale: Locale;
  /** The session the request's token belongs to (the `sid`); absent only on collab's internal recheck. */
  sessionId?: string;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    return data ? user?.[data] : user;
  },
);

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const ROLES_KEY = "roles";
/** Restricts a route (or controller) to the given tenant roles. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const SUPERADMIN_KEY = "superAdmin";
/** Restricts a route (or controller) to instance superadmins (god mode). */
export const SuperAdminOnly = () => SetMetadata(SUPERADMIN_KEY, true);

export const MODULE_KEY = "module";
/** Returns 403 when the module is disabled for the instance or the user's organization. */
export const RequireModule = (module: ModuleKey) =>
  SetMetadata(MODULE_KEY, module);

export const ALLOW_FILE_COOKIE_KEY = "allowFileCookie";
/**
 * Lets a GET route also authenticate with the httpOnly file cookie, so
 * <img>, CSS backgrounds and download links work without an Authorization header.
 */
export const AllowFileCookie = () => SetMetadata(ALLOW_FILE_COOKIE_KEY, true);

export const FILE_COOKIE = "cluster_files";

/** httpOnly, SameSite=Strict, path /api/v1/auth: the opaque refresh token of the session. */
export const SESSION_COOKIE = "cluster_session";

/** Who is acting and from where; recorded in the audit log by org administration. */
export interface ActorContext {
  userId: string;
  orgId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export const Actor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ActorContext => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;
    return {
      userId: user.id,
      orgId: user.orgId,
      // req.ip honours TRUST_PROXY; reading X-Forwarded-For directly would let any client forge it.
      ipAddress: request.ip ?? null,
      userAgent: request.headers["user-agent"] ?? null,
    };
  },
);
