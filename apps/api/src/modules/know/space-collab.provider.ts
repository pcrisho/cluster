import {
  Injectable,
  NotFoundException,
  OnModuleInit,
  UnprocessableEntityException,
} from "@nestjs/common";
import { AccessRole, ModuleKey, Prisma } from "@prisma/client";
import {
  assertValidDoc,
  collectImageKeys,
  EMPTY_DOC,
  InvalidDocError,
} from "@cluster/editor-schema";
import type { AuthenticatedUser } from "../../common/decorators";
import { PrismaService } from "../../prisma/prisma.service";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { CollabRegistry } from "../collab/collab.registry";
import type {
  CollabDocumentProvider,
  CollabFields,
  CollabMode,
  CollabStoreInput,
} from "../collab/collab.types";
import { KnowMediaService } from "./know-media.service";
import { imageFolder, spaceOwner } from "./media-owner";
import { SpaceAccessService } from "./space-access.service";

export const spaceDocumentName = (spaceId: string) => `know.space:${spaceId}`;

/**
 * The description of a KNOW space, edited live. Writing it needs MANAGER on the space (the same as
 * every other change to the space); the name stays edited through REST, so `title` is only shown.
 */
@Injectable()
export class SpaceCollabProvider
  implements CollabDocumentProvider, OnModuleInit
{
  readonly kind = "know.space";
  readonly module = ModuleKey.KNOW;

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly access: SpaceAccessService,
    private readonly registry: CollabRegistry,
    private readonly media: KnowMediaService,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async organizationOf(id: string): Promise<string | null> {
    const space = await this.system.space.findUnique({
      where: { id },
      select: { organizationId: true },
    });
    return space?.organizationId ?? null;
  }

  async authorize(user: AuthenticatedUser, id: string): Promise<CollabMode> {
    const role = await this.access.requireSpace(user, id, "READ");
    return role === AccessRole.MANAGER ? "WRITE" : "READ";
  }

  async load(
    id: string,
  ): Promise<{
    ydoc: Buffer | null;
    revision: number;
    fields: CollabFields;
  } | null> {
    const space = await this.prisma.space.findUnique({
      where: { id },
      omit: { ydoc: false },
    });
    if (!space) return null;
    return {
      ydoc: space.ydoc ? Buffer.from(space.ydoc) : null,
      revision: space.ydocRevision,
      fields: {
        body: space.descriptionContent ?? EMPTY_DOC,
        title: space.name,
      },
    };
  }

  /** Raw SQL on purpose: only the first writer gets a row count of 1, and `updatedAt` stays as it was. */
  async seed(id: string, ydoc: Buffer): Promise<boolean> {
    const seeded = await this.prisma.$executeRaw`
      UPDATE "spaces" SET "ydoc" = ${ydoc}, "ydocRevision" = 1 WHERE "id" = ${id} AND "ydoc" IS NULL`;
    if (seeded === 1) return true;
    const exists = await this.prisma.space.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException("Space not found");
    return false;
  }

  /** Saves the description; `title` is ignored (the name changes only through REST). */
  async store(id: string, input: CollabStoreInput): Promise<boolean> {
    const space = await this.prisma.space.findUnique({
      where: { id },
      select: { descriptionContent: true, organizationId: true },
    });
    if (!space) return false;
    const orgId = space.organizationId;
    const { body } = input.fields;
    try {
      assertValidDoc(body, { orgId });
    } catch (error) {
      if (error instanceof InvalidDocError)
        throw new UnprocessableEntityException(error.message);
      throw error;
    }

    const { count } = await this.prisma.space.updateMany({
      where: { id },
      data: {
        ydoc: new Uint8Array(input.ydoc),
        ydocRevision: { increment: 1 },
        descriptionContent: body as Prisma.InputJsonValue,
      },
    });
    if (count !== 1) return false;

    const kept = collectImageKeys(body);
    await this.media.deleteUnusedImages(
      orgId,
      [...collectImageKeys(space.descriptionContent)].filter(
        (key) => !kept.has(key),
      ),
      [imageFolder(orgId, spaceOwner(id))],
    );
    return true;
  }
}
