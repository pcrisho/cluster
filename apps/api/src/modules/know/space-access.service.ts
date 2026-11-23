import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common"
import { AccessRole, PageStatus, Prisma, UserRole } from "@prisma/client"
import type { AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { principalWhere } from "../org/principal"
import { PrincipalService } from "../org/principal.service"
import type { MediaOwner } from "./media-owner"
import { allows, spaceRole, spaceRoles, type Need } from "./space-access"

/** The one place that decides who can see and change what in KNOW. Unreadable spaces look missing (404). */
@Injectable()
export class SpaceAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly principals: PrincipalService,
  ) {}

  /** The user's role in the space, or null if it is in another organization or hidden from them. */
  async roleIn(user: AuthenticatedUser, spaceId: string): Promise<AccessRole | null> {
    const space = await this.prisma.space.findFirst({
      where: { id: spaceId, organizationId: user.orgId },
      select: { restricted: true },
    })
    if (!space) return null
    const isAdmin = user.role === UserRole.ADMIN
    return spaceRole({
      isAdmin,
      restricted: space.restricted,
      matchedRoles: isAdmin ? [] : await this.matchedRoles(user, spaceId),
    })
  }

  async requireSpace(user: AuthenticatedUser, spaceId: string, need: Need): Promise<AccessRole> {
    return this.check(await this.roleIn(user, spaceId), need, "Space not found")
  }

  /**
   * A page of the user's organization they may use at this level. Drafts and archived pages
   * are invisible to anyone who cannot edit the space.
   */
  async requirePage(user: AuthenticatedUser, pageId: string, need: Need) {
    const page = await this.prisma.page.findFirst({
      where: { id: pageId, space: { organizationId: user.orgId } },
      select: { id: true, spaceId: true, status: true },
    })
    const role = page ? await this.roleIn(user, page.spaceId) : null
    if (!page || (page.status !== PageStatus.PUBLISHED && !allows(role, "EDIT"))) {
      throw new NotFoundException("Page not found")
    }
    return { page, role: this.check(role, need, "Page not found") }
  }

  /**
   * Access to what a file belongs to: reading follows READ; writing needs EDIT on a page and
   * MANAGE on a space (the same as changing its body or its description).
   */
  async requireOwner(user: AuthenticatedUser, owner: MediaOwner, need: "READ" | "WRITE"): Promise<void> {
    if (owner.kind === "page") await this.requirePage(user, owner.id, need === "READ" ? "READ" : "EDIT")
    else await this.requireSpace(user, owner.id, need === "READ" ? "READ" : "MANAGE")
  }

  /** The full row of a page the user may edit. */
  async requireEditablePage(user: AuthenticatedUser, pageId: string) {
    await this.requirePage(user, pageId, "EDIT")
    return this.prisma.page.findUniqueOrThrow({ where: { id: pageId } })
  }

  /**
   * The user's role in every space they can read (ADMIN: all of the organization's spaces),
   * so lists can be filtered and annotated with `myRole` in one go.
   */
  async rolesInOrg(user: AuthenticatedUser): Promise<Map<string, AccessRole>> {
    if (user.role === UserRole.ADMIN) {
      const all = await this.prisma.space.findMany({ where: { organizationId: user.orgId }, select: { id: true } })
      return new Map(all.map((s) => [s.id, "MANAGER" as AccessRole]))
    }
    const ctx = await this.principals.contextFor(user.id, user.orgId)
    const [open, entries] = await Promise.all([
      this.prisma.space.findMany({ where: { organizationId: user.orgId, restricted: false }, select: { id: true } }),
      this.prisma.spaceAccess.findMany({
        where: { space: { organizationId: user.orgId }, ...principalWhere(ctx) },
        select: { spaceId: true, role: true },
      }),
    ])
    return spaceRoles(
      open.map((s) => s.id),
      entries,
    )
  }

  /** True for ADMIN and for anyone who is editor or manager of at least one space. */
  async canEditAnywhere(user: AuthenticatedUser): Promise<boolean> {
    if (user.role === UserRole.ADMIN) return true;
    const roles = await this.rolesInOrg(user);
    return [...roles.values()].some((r) => allows(r, "EDIT"));
  }

  /** Filter for page lists (search, mentions): readable spaces only, drafts and archived only where the user edits. */
  async pageFilter(user: AuthenticatedUser): Promise<Prisma.PageWhereInput> {
    const inOrg: Prisma.PageWhereInput = { space: { organizationId: user.orgId } }
    if (user.role === UserRole.ADMIN) return inOrg
    const roles = await this.rolesInOrg(user)
    const readable = [...roles.keys()]
    const editable = readable.filter((id) => allows(roles.get(id) ?? null, "EDIT"))
    return {
      AND: [
        inOrg,
        { OR: [{ spaceId: { in: editable } }, { spaceId: { in: readable }, status: PageStatus.PUBLISHED }] },
      ],
    }
  }

  private check(role: AccessRole | null, need: Need, missing: string): AccessRole {
    if (role === null) throw new NotFoundException(missing)
    if (!allows(role, need)) throw new ForbiddenException("You do not have permission to perform this action")
    return role
  }

  private async matchedRoles(user: AuthenticatedUser, spaceId: string): Promise<AccessRole[]> {
    const ctx = await this.principals.contextFor(user.id, user.orgId)
    const rows = await this.prisma.spaceAccess.findMany({
      where: { spaceId, ...principalWhere(ctx) },
      select: { role: true },
    })
    return rows.map((r) => r.role)
  }
}
