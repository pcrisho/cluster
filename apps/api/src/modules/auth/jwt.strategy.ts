import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { AuthUserService } from "./auth-user.service";
import { AuthTokens } from "./auth-tokens";
import { FILE_COOKIE, type AuthenticatedUser } from "../../common/decorators";
import type { Request } from "express";
import { readCookie } from "../../common/cookies";

/** Bearer header first; the file cookie only where the route allows it (see JwtAuthGuard). */
function extractToken(
  req: Request & { allowFileCookie?: boolean },
): string | null {
  const bearer = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (bearer || !req.allowFileCookie) return bearer;
  return readCookie(req.headers.cookie, FILE_COOKIE);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    tokens: AuthTokens,
    private readonly authUser: AuthUserService,
  ) {
    super({
      jwtFromRequest: extractToken,
      passReqToCallback: true,
      ignoreExpiration: false,
      algorithms: ["HS256"],
      audience: ["access", "file"],
      // The `kid` header picks the current or the previous secret (AuthTokens).
      secretOrKeyProvider: (
        _req: Request,
        raw: string,
        done: (err: unknown, secret?: string) => void,
      ) => {
        const secret = tokens.secretFor(raw);
        if (secret) done(null, secret);
        else done(new UnauthorizedException("Unknown signing key"));
      },
    });
  }

  // Role, status, modules and the session are read from the DB on every request, so admin
  // changes and a revoked session apply without waiting for the token to expire.
  async validate(
    req: Request & { allowFileCookie?: boolean },
    payload: { sub?: unknown; sid?: unknown; aud?: unknown },
  ): Promise<AuthenticatedUser> {
    const allowed =
      payload.aud === "access" ||
      (payload.aud === "file" && req.allowFileCookie);
    if (
      !allowed ||
      typeof payload.sub !== "string" ||
      typeof payload.sid !== "string"
    ) {
      throw new UnauthorizedException("Invalid token type");
    }
    return this.authUser.load(payload.sub, payload.sid);
  }
}
