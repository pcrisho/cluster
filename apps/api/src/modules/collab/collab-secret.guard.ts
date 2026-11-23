import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "crypto";
import { CollabConfig } from "./collab.config";

/**
 * Authenticates calls from the collab service. Not global: controllers opt in with
 * @UseGuards(CollabSecretGuard) and @Public(), since the JWT guard does not apply to them.
 */
@Injectable()
export class CollabSecretGuard implements CanActivate {
  constructor(private readonly config: CollabConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const headers = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, unknown> }>().headers;
    const expected = this.config.secret;
    const received = headers["x-collab-secret"];
    if (!expected || typeof received !== "string")
      throw new UnauthorizedException();
    // Hashing makes both digests the same length, which timingSafeEqual requires.
    const a = createHash("sha256").update(received).digest();
    const b = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(a, b)) throw new UnauthorizedException();
    return true;
  }
}
