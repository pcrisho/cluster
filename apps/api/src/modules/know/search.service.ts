import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { SpaceAccessService } from "./space-access.service";

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
  ) {}

  /**
   * Title lookup behind the editor's `@mention` picker, newest activity first.
   * An empty `q` returns the most recently updated pages. Only pages the user
   * may read are returned; `archived` lets the UI badge archived pages.
   */
  async forMentions(
    user: AuthenticatedUser,
    q: string,
    spaceId: string | undefined,
    limit: number,
  ) {
    const text = q.trim();
    const where: Prisma.PageWhereInput = {
      AND: [
        await this.access.pageFilter(user),
        ...(spaceId ? [{ spaceId }] : []),
        ...(text
          ? [{ title: { contains: text, mode: "insensitive" as const } }]
          : []),
      ],
    };

    const pages = await this.prisma.page.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: limit,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        space: { select: { id: true, name: true } },
      },
    });

    return pages.map((p) => ({
      id: p.id,
      title: p.title || "(untitled)",
      spaceId: p.space.id,
      spaceName: p.space.name,
      updatedAt: p.updatedAt,
      archived: p.status === "ARCHIVED",
    }));
  }

  /** Full-text search over titles and page bodies. */
  async pages(user: AuthenticatedUser, query: string, spaceId?: string) {
    const text = query.trim();
    const where: Prisma.PageWhereInput = {
      AND: [
        await this.access.pageFilter(user),
        ...(spaceId ? [{ spaceId }] : []),
        {
          OR: [
            { title: { contains: text, mode: "insensitive" } },
            { searchText: { contains: text, mode: "insensitive" } },
          ],
        },
      ],
    };

    const pages = await this.prisma.page.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        space: { select: { id: true, name: true } },
        author: { select: { id: true, firstName: true, lastName: true } },
        _count: { select: { versions: true } },
      },
    });

    return { success: true, data: pages };
  }
}
