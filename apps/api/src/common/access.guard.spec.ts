import { ExecutionContext, ForbiddenException } from "@nestjs/common"
import { Reflector } from "@nestjs/core"
import { ModuleKey, UserRole } from "@prisma/client"
import { AccessGuard } from "./access.guard"
import { MODULE_KEY, ROLES_KEY, SUPERADMIN_KEY, type AuthenticatedUser } from "./decorators"
import { effectiveModules } from "./instance-settings"
import { slugify } from "./slugify"

const baseUser: AuthenticatedUser = {
  id: "u1",
  email: "u1@x.com",
  role: UserRole.COLLABORATOR,
  orgId: "org-1",
  isSuperAdmin: false,
  modules: [ModuleKey.KNOW],
  capabilities: [],
  locale: "en",
}

function run(metadata: Record<string, unknown>, user: AuthenticatedUser | undefined) {
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector
  const context = {
    getType: () => "http",
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext
  return new AccessGuard(reflector).canActivate(context)
}

describe("AccessGuard", () => {
  it("lets public (anonymous) routes through", () => {
    expect(run({ [ROLES_KEY]: [UserRole.ADMIN] }, undefined)).toBe(true)
  })

  it("allows a route of an enabled module", () => {
    expect(run({ [MODULE_KEY]: ModuleKey.KNOW }, baseUser)).toBe(true)
  })

  it("rejects a route of a disabled module", () => {
    expect(() => run({ [MODULE_KEY]: ModuleKey.GROW }, baseUser)).toThrow(ForbiddenException)
  })

  it("rejects superadmin routes for regular users, even tenant admins", () => {
    const admin = { ...baseUser, role: UserRole.ADMIN }
    expect(() => run({ [SUPERADMIN_KEY]: true }, admin)).toThrow(ForbiddenException)
    expect(run({ [SUPERADMIN_KEY]: true }, { ...admin, isSuperAdmin: true })).toBe(true)
  })

  it("enforces tenant roles", () => {
    expect(() => run({ [ROLES_KEY]: [UserRole.ADMIN] }, baseUser)).toThrow(ForbiddenException)
    expect(run({ [ROLES_KEY]: [UserRole.ADMIN] }, { ...baseUser, role: UserRole.ADMIN })).toBe(true)
  })
})

describe("effectiveModules", () => {
  it("keeps only modules offered by the instance and enabled by the org", () => {
    expect(
      effectiveModules([ModuleKey.KNOW, ModuleKey.GROW], [ModuleKey.GROW, ModuleKey.CONNECT]),
    ).toEqual([ModuleKey.GROW])
  })
})

describe("slugify", () => {
  it("strips accents and symbols", () => {
    expect(slugify("  Compañía Ñandú & Co. ")).toBe("compania-nandu-co")
  })
})
