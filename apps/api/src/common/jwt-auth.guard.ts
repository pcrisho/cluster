import { Injectable, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";
import { ALLOW_FILE_COOKIE_KEY, IS_PUBLIC_KEY } from "./decorators";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets);
    if (isPublic) return true;

    // Read by JwtStrategy: file-cookie tokens are only valid on routes that opt in.
    const request = context.switchToHttp().getRequest();
    request.allowFileCookie =
      request.method === "GET" &&
      !!this.reflector.getAllAndOverride<boolean>(ALLOW_FILE_COOKIE_KEY, targets);
    return super.canActivate(context);
  }
}
