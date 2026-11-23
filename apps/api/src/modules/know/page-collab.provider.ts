import { Injectable, NotFoundException, OnModuleInit, UnprocessableEntityException } from "@nestjs/common"
import { AccessRole, ModuleKey, Prisma } from "@prisma/client"
import { assertValidDoc, collectImageKeys, extractText, InvalidDocError } from "@cluster/editor-schema"
import type { AuthenticatedUser } from "../../common/decorators"
import { PrismaService } from "../../prisma/prisma.service"
import { SystemPrismaService } from "../../prisma/system-prisma.service"
import { roleAtLeast } from "../org/access-role"
import { CollabRegistry } from "../collab/collab.registry"
import type { CollabDocumentProvider, CollabFields, CollabMode, CollabStoreInput } from "../collab/collab.types"
import { KnowMediaService } from "./know-media.service"
import { SpaceAccessService } from "./space-access.service"

/** Same limit as the REST DTOs (create-page.dto.ts, update-page.dto.ts). */
const MAX_TITLE_LENGTH = 200

export const pageDocumentName = (pageId: string) => `know.page:${pageId}`

/** Collaborative editing of KNOW pages. Access is decided by SpaceAccessService, never by user.role. */
@Injectable()
export class PageCollabProvider implements CollabDocumentProvider, OnModuleInit {
  readonly kind = "know.page"
  readonly module = ModuleKey.KNOW

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly access: SpaceAccessService,
    private readonly registry: CollabRegistry,
    private readonly media: KnowMediaService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this)
  }

  async organizationOf(id: string): Promise<string | null> {
    const page = await this.system.page.findUnique({ where: { id }, select: { space: { select: { organizationId: true } } } })
    return page?.space.organizationId ?? null
  }

  async authorize(user: AuthenticatedUser, id: string): Promise<CollabMode> {
    const { role } = await this.access.requirePage(user, id, "READ")
    return roleAtLeast(role, AccessRole.EDITOR) ? "WRITE" : "READ"
  }

  async load(id: string): Promise<{ ydoc: Buffer | null; revision: number; fields: CollabFields } | null> {
    const page = await this.prisma.page.findUnique({ where: { id }, omit: { ydoc: false } })
    if (!page) return null
    return {
      ydoc: page.ydoc ? Buffer.from(page.ydoc) : null,
      revision: page.ydocRevision,
      fields: { body: page.content, title: page.title },
    }
  }

  /**
   * Raw SQL on purpose: only the first writer gets a row count of 1, and `updatedAt` stays as it
   * was (merely opening a page is not an edit, which an ORM update would record).
   */
  async seed(id: string, ydoc: Buffer): Promise<boolean> {
    const seeded = await this.prisma.$executeRaw`
      UPDATE "pages" SET "ydoc" = ${ydoc}, "ydocRevision" = 1 WHERE "id" = ${id} AND "ydoc" IS NULL`
    if (seeded === 1) return true
    const exists = await this.prisma.page.findUnique({ where: { id }, select: { id: true } })
    if (!exists) throw new NotFoundException("Page not found")
    return false
  }

  async store(id: string, input: CollabStoreInput): Promise<boolean> {
    const page = await this.prisma.page.findUnique({
      where: { id },
      select: { content: true, space: { select: { organizationId: true } } },
    })
    if (!page) return false
    const orgId = page.space.organizationId
    const { body, title } = input.fields
    this.assertValidFields(body, title, orgId)

    // The last editor of the list who belongs to this organization; nobody to credit leaves it as it was.
    const members = await this.prisma.user.findMany({
      where: { id: { in: input.editors }, organizationId: orgId },
      select: { id: true },
    })
    const memberIds = new Set(members.map((m) => m.id))
    const lastEditor = [...input.editors].reverse().find((editor) => memberIds.has(editor))

    const { count } = await this.prisma.page.updateMany({
      where: { id },
      data: {
        ydoc: new Uint8Array(input.ydoc),
        ydocRevision: { increment: 1 },
        content: body as Prisma.InputJsonValue,
        title,
        searchText: extractText(body),
        ...(lastEditor ? { lastEditedById: lastEditor } : {}),
      },
    })
    if (count !== 1) return false

    const kept = collectImageKeys(body)
    await this.media.deleteUnusedImages(
      orgId,
      [...collectImageKeys(page.content)].filter((key) => !kept.has(key)),
    )
    return true
  }

  /** Bad content is a 422 (the caller keeps the last good state); the images must be this organization's. */
  private assertValidFields(body: unknown, title: unknown, orgId: string): void {
    if (typeof title !== "string" || title.length > MAX_TITLE_LENGTH || /[\r\n]/.test(title)) {
      throw new UnprocessableEntityException(`title must be one line of at most ${MAX_TITLE_LENGTH} characters`)
    }
    try {
      assertValidDoc(body, { orgId })
    } catch (error) {
      if (error instanceof InvalidDocError) throw new UnprocessableEntityException(error.message)
      throw error
    }
  }
}
