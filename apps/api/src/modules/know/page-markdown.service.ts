import { BadRequestException, Injectable } from "@nestjs/common";
import {
  docToMarkdown,
  markdownToDoc,
  MarkdownImportError,
} from "@cluster/editor-schema";
import { bestEffort } from "../../common/best-effort";
import type { AuthenticatedUser } from "../../common/decorators";
import { slugify } from "../../common/slugify";
import { PrismaService } from "../../prisma/prisma.service";
import { CollabClient } from "../collab/collab.client";
import { ImportMarkdownDto } from "./dto/import-markdown.dto";
import { assertPageContent } from "./know-validation";
import { pageDocumentName } from "./page-collab.provider";
import { PagesService } from "./pages.service";
import { SpaceAccessService } from "./space-access.service";

@Injectable()
export class PageMarkdownService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: SpaceAccessService,
    private readonly pages: PagesService,
    private readonly collab: CollabClient,
  ) {}

  /** Creates a draft page from Markdown; what the editor cannot hold is left out and listed in `dropped`. */
  async import(
    user: AuthenticatedUser,
    spaceId: string,
    dto: ImportMarkdownDto,
  ) {
    await this.access.requireSpace(user, spaceId, "EDIT");

    let imported;
    try {
      imported = markdownToDoc(dto.markdown);
    } catch (error) {
      if (error instanceof MarkdownImportError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
    assertPageContent(imported.doc, user.orgId);

    const created = await this.pages.create(user, spaceId, {
      title: imported.title ?? dto.title ?? "",
      content: imported.doc as Record<string, unknown>,
      status: "DRAFT",
      parentId: dto.parentId,
    });
    return { ...created, dropped: imported.dropped };
  }

  async export(user: AuthenticatedUser, pageId: string) {
    await this.access.requirePage(user, pageId, "READ");
    const select = { title: true, content: true, ydocRevision: true };
    let page = await this.prisma.page.findUniqueOrThrow({
      where: { id: pageId },
      select,
    });
    if (page.ydocRevision > 0) {
      // A live page reaches its row a few seconds late; ask collab to save first, but read on if it is down.
      await bestEffort("collab flush", () =>
        this.collab.flush(pageDocumentName(pageId)),
      );
      page = await this.prisma.page.findUniqueOrThrow({
        where: { id: pageId },
        select,
      });
    }

    const { markdown, lost } = docToMarkdown(page.content);
    const title = page.title.trim();
    return {
      success: true,
      data: {
        filename: `${slugify(title) || "untitled"}.md`,
        markdown: title ? `# ${title}\n\n${markdown}` : markdown,
        lost,
      },
    };
  }
}
