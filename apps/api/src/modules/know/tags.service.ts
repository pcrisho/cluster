import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateTagDto } from "./dto/create-tag.dto";
import { SpaceAccessService } from "./space-access.service";

@Injectable()
export class TagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
  ) {}

  async list(orgId: string) {
    const tags = await this.prisma.tag.findMany({
      where: { organizationId: orgId },
      orderBy: { name: "asc" },
      include: { _count: { select: { pages: true } } },
    });

    return { success: true, data: tags };
  }

  async create(user: AuthenticatedUser, dto: CreateTagDto) {
    const { orgId } = user;
    if (!(await this.access.canEditAnywhere(user))) {
      throw new ForbiddenException("Only editors can create tags");
    }

    const existing = await this.prisma.tag.findUnique({
      where: { name_organizationId: { name: dto.name, organizationId: orgId } },
    });
    if (existing)
      throw new ConflictException({
        code: "TAG_TAKEN",
        message: "Tag already exists",
      });

    const slug = await this.uniqueSlug(dto.name, orgId);
    const tag = await this.prisma.tag.create({
      data: { name: dto.name, slug, organizationId: orgId },
    });

    return { success: true, data: tag };
  }

  async remove(user: AuthenticatedUser, tagId: string) {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only administrators can delete tags");
    }

    const tag = await this.prisma.tag.findFirst({
      where: { id: tagId, organizationId: user.orgId },
    });
    if (!tag) throw new NotFoundException("Tag not found");

    await this.prisma.tag.delete({ where: { id: tagId } });
    return { success: true };
  }

  private async uniqueSlug(name: string, orgId: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || `tag-${Math.random().toString(36).slice(2, 10)}`;

    let slug = base;
    for (let attempt = 1; attempt <= 100; attempt++) {
      const existing = await this.prisma.tag.findFirst({
        where: { slug, organizationId: orgId },
        select: { id: true },
      });
      if (!existing) return slug;
      slug = `${base}-${attempt}`;
    }
    throw new Error("Could not generate unique tag slug");
  }
}
