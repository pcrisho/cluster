import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

const ORIGIN_REQUIRED = "sameOriginRequired";

const originOf = (url: string | undefined) => {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
};

/**
 * CSRF wall for the routes that set or use the session cookie: the request's `Origin` (or `Referer`)
 * must be the web app's. `required` routes (refresh, logout: authenticated by the cookie alone) also
 * refuse a request that names no origin; the others only refuse a foreign one.
 */
@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly webOrigin: string | null;

  constructor(
    private readonly reflector: Reflector,
    config: ConfigService,
  ) {
    this.webOrigin = originOf(
      config.get<string>("WEB_URL", "http://localhost:3000"),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const origin =
      originOf(req.headers.origin) ?? originOf(req.headers.referer);
    const required = this.reflector.get<boolean>(
      ORIGIN_REQUIRED,
      context.getHandler(),
    );
    if (origin === this.webOrigin || (!origin && !required)) return true;
    throw new ForbiddenException({
      code: "ORIGIN_MISMATCH",
      message: "Request from another origin",
    });
  }
}

export const SameOrigin = (opts: { required?: boolean } = {}) =>
  applyDecorators(
    SetMetadata(ORIGIN_REQUIRED, !!opts.required),
    UseGuards(SameOriginGuard),
  );
