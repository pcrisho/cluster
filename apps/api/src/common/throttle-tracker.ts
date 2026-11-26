import { Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerModuleOptions,
  type ThrottlerRequest,
  type ThrottlerStorage,
} from "@nestjs/throttler";
import { createHash } from "crypto";
import { parseRefreshToken } from "../modules/auth/auth-tokens";
import { readCookie } from "./cookies";
import { SESSION_COOKIE } from "./decorators";

interface ThrottledRequest {
  ip?: string;
  path?: string;
  user?: { id?: string };
  body?: unknown;
  headers?: { cookie?: string };
}

const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);

const isSessionRoute = (path: string) =>
  path.endsWith("/auth/refresh") || path.endsWith("/auth/logout");

/**
 * Who a rate limit counts against. A company's people usually share one public address, so a limit
 * per IP would lock everyone out once a few of them sign in or reload at the same time:
 * - signed-in requests count per person;
 * - refresh and logout count per session, named by the refresh token (`refreshOwner`; the token rotates
 *   but the session id stays, so a loop is still stopped);
 * - sign-in counts per address and account, which still stops guessing one account's password;
 * - everything else (register, forgot password, certificate verification, invalid tokens) per address.
 */
export function throttleTracker(
  req: ThrottledRequest,
  refreshOwner: string | null = null,
): string {
  if (req.user?.id) return `user:${req.user.id}`;
  const path = req.path ?? "";
  if (isSessionRoute(path) && refreshOwner) return `session:${refreshOwner}`;
  const body = (req.body ?? {}) as { email?: unknown };
  if (path.endsWith("/auth/login") && typeof body.email === "string") {
    return `ip:${req.ip}:login:${hash(body.email.trim().toLowerCase())}`;
  }
  return `ip:${req.ip}`;
}

/** The global ThrottlerGuard with the tracker above. Runs after JwtAuthGuard, so `req.user` is set. */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
  ) {
    super(options, storage, reflector);
  }

  protected async getTracker(raw: Record<string, unknown>): Promise<string> {
    const req = raw as ThrottledRequest;
    return throttleTracker(
      req,
      isSessionRoute(req.path ?? "") ? this.refreshOwner(req) : null,
    );
  }

  /**
   * The session id is read from the cookie without a lookup, so a made-up one would get a fresh counter:
   * on refresh and logout the second throttler (`auth`) counts per address instead, as a ceiling.
   */
  protected async handleRequest(props: ThrottlerRequest): Promise<boolean> {
    const req = props.context.switchToHttp().getRequest<ThrottledRequest>();
    if (props.throttler.name === "auth" && isSessionRoute(req.path ?? "")) {
      return super.handleRequest({
        ...props,
        getTracker: () => `ip:${req.ip}`,
      });
    }
    return super.handleRequest(props);
  }

  /** The session the refresh cookie names, if it is well-formed. Not verified here: that costs a lookup. */
  private refreshOwner(req: ThrottledRequest): string | null {
    return (
      parseRefreshToken(readCookie(req.headers?.cookie, SESSION_COOKIE))?.sid ??
      null
    );
  }
}
