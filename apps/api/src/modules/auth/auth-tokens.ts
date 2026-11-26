import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomBytes } from "crypto";

/** What a signed token is for: the bearer header, or the read-only file cookie. */
export type TokenAudience = "access" | "file";

/** The claims every session token carries: whose it is and which session it belongs to. */
export interface SessionClaims {
  sub: string;
  sid: string;
}

/** Short, public name of a signing secret, sent as the `kid` header so a previous secret can still verify. */
export const keyId = (secret: string) =>
  createHash("sha256").update(secret).digest("hex").slice(0, 8);

export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET = /^[A-Za-z0-9_-]{43}$/;

/** A new opaque refresh token for a session: `<sid>.<secret>`. Only the hash of the secret is stored. */
export function newRefreshToken(sid: string): { token: string; hash: string } {
  const secret = randomBytes(32).toString("base64url");
  return { token: `${sid}.${secret}`, hash: sha256(secret) };
}

/** The session id and secret hash of a well-formed refresh token, or null. Says nothing about validity. */
export function parseRefreshToken(
  token: unknown,
): { sid: string; hash: string } | null {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  const sid = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (dot < 0 || !UUID.test(sid) || !SECRET.test(secret)) return null;
  return { sid, hash: sha256(secret) };
}

/**
 * Signs and verifies the access and file JWTs. HS256 only; the audience tells the two apart and the
 * `kid` header picks the secret, so `JWT_SECRET_PREVIOUS` keeps verifying while a rotation settles.
 */
@Injectable()
export class AuthTokens {
  private readonly kid: string;
  private readonly secret: string;
  private readonly secrets = new Map<string, string>();

  constructor(
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.secret = config.getOrThrow<string>("JWT_SECRET");
    this.kid = keyId(this.secret);
    this.secrets.set(this.kid, this.secret);
    const previous = config.get<string>("JWT_SECRET_PREVIOUS");
    if (previous) this.secrets.set(keyId(previous), previous);
  }

  /** `expiresIn` in seconds. */
  sign(
    audience: TokenAudience,
    claims: SessionClaims,
    expiresIn: number,
  ): string {
    return this.jwt.sign(
      { sub: claims.sub, sid: claims.sid },
      {
        secret: this.secret,
        keyid: this.kid,
        audience,
        expiresIn,
        algorithm: "HS256",
      },
    );
  }

  /** The secret for a token's `kid`, or undefined; for passport-jwt's key provider. */
  secretFor(token: string): string | undefined {
    const decoded = this.jwt.decode<{ header?: { kid?: unknown } } | null>(
      token,
      { complete: true },
    );
    const kid = decoded?.header?.kid;
    return typeof kid === "string" ? this.secrets.get(kid) : undefined;
  }

  /** The claims of a valid token for one of the audiences, or null (bad signature, expired, other audience, unknown key). */
  verify(
    token: string,
    audiences: TokenAudience[],
  ): (SessionClaims & { aud: TokenAudience; exp: number }) | null {
    const secret = this.secretFor(token);
    if (!secret) return null;
    try {
      const payload = this.jwt.verify<Record<string, unknown>>(token, {
        secret,
        algorithms: ["HS256"],
        audience: audiences as [string, ...string[]],
      });
      const { sub, sid, aud, exp } = payload;
      if (
        typeof sub !== "string" ||
        typeof sid !== "string" ||
        typeof exp !== "number"
      )
        return null;
      if (!audiences.includes(aud as TokenAudience)) return null;
      return { sub, sid, aud: aud as TokenAudience, exp };
    } catch {
      return null;
    }
  }
}
