import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { hkdfSync } from "crypto";

/** The key for one use (HKDF-SHA256 with a label). Exported for the dev seed, which seals the demo 2FA secret. */
export function deriveAuthKey(
  label: string,
  authSecretKey: string | undefined,
  jwtSecret: string,
): Buffer {
  return Buffer.from(
    hkdfSync("sha256", authSecretKey || jwtSecret, "", `cluster:${label}`, 32),
  );
}

/**
 * Keys derived from AUTH_SECRET_KEY, one per use, so no two features share key material. Production
 * refuses to start without AUTH_SECRET_KEY (startup-config.ts); in development JWT_SECRET stands in.
 */
@Injectable()
export class AuthKeys {
  private readonly authSecretKey: string | undefined;
  private readonly jwtSecret: string;

  constructor(config: ConfigService) {
    this.authSecretKey = config.get<string>("AUTH_SECRET_KEY");
    this.jwtSecret = config.getOrThrow<string>("JWT_SECRET");
  }

  derive(label: string): Buffer {
    return deriveAuthKey(label, this.authSecretKey, this.jwtSecret);
  }
}
