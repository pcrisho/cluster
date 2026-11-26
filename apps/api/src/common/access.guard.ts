import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import type { ModuleKey, UserRole } from "@prisma/client"
import { MODULE_KEY, ROLES_KEY, SUPERADMIN_KEY, type AuthenticatedUser } from "./decorators"

/**
 * Global guard (runs after JwtAuthGuard) that enforces @RequireModule,
 * @SuperAdminOnly and @Roles metadata from the handler or its controller.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== "http") return true
    const user = context.switchToHttp().getRequest().user as AuthenticatedUser | undefined
    // No user means a @Public() route: JwtAuthGuard already rejected anonymous calls elsewhere.
    if (!user) return true

    const targets = [context.getHandler(), context.getClass()]

    const module = this.reflector.getAllAndOverride<ModuleKey | undefined>(MODULE_KEY, targets)
    if (module && !user.modules.includes(module)) {
      throw new ForbiddenException({ code: "MODULE_DISABLED", message: `The ${module} module is not enabled` })
    }

    const superAdminOnly = this.reflector.getAllAndOverride<boolean | undefined>(SUPERADMIN_KEY, targets)
    if (superAdminOnly && !user.isSuperAdmin) {
      throw new ForbiddenException("Instance administrator access required")
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, targets)
    if (roles && !roles.includes(user.role)) {
      throw new ForbiddenException("You do not have permission to perform this action")
    }

    return true
  }
}
