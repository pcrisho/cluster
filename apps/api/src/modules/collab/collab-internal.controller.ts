import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "../../common/decorators";
import { withOrg } from "../../common/request-context";
import { CollabAuthService } from "./collab-auth.service";
import { CollabConfig } from "./collab.config";
import { CollabRegistry } from "./collab.registry";
import { CollabSecretGuard } from "./collab-secret.guard";
import type { CollabDocumentProvider } from "./collab.types";
import { AuthorizeDto, AuthorizeUserDto } from "./dto/authorize.dto";
import { SeedDocumentDto, StoreDocumentDto } from "./dto/document.dto";

/** Called by apps/collab over the internal network; authenticated by X-Collab-Secret, not by JWT. */
@Public()
@SkipThrottle()
@UseGuards(CollabSecretGuard)
@Controller("internal/collab")
export class CollabInternalController {
  constructor(
    private readonly auth: CollabAuthService,
    private readonly registry: CollabRegistry,
    private readonly config: CollabConfig,
  ) {}

  @Post("authorize")
  @HttpCode(200)
  authorize(@Body() dto: AuthorizeDto) {
    return this.auth.authorizeToken(dto.token, dto.documentName);
  }

  @Post("authorize-user")
  @HttpCode(200)
  authorizeUser(@Body() dto: AuthorizeUserDto) {
    return this.auth.authorizeUser(dto.userId, dto.documentName, dto.sessionId);
  }

  @Get("documents/:kind/:id")
  async load(
    @Param("kind") kind: string,
    @Param("id", new ParseUUIDPipe()) id: string,
  ) {
    const loaded = await this.inOrgOf(kind, id, (provider) =>
      provider.load(id),
    );
    if (!loaded) throw new NotFoundException("Document not found");
    return {
      ...loaded,
      ydoc: loaded.ydoc ? loaded.ydoc.toString("base64") : null,
    };
  }

  @Put("documents/:kind/:id/seed")
  @HttpCode(204)
  async seed(
    @Param("kind") kind: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: SeedDocumentDto,
  ) {
    const seeded = await this.inOrgOf(kind, id, (provider) =>
      provider.seed(id, this.decodeState(dto.ydoc)),
    );
    if (!seeded) throw new ConflictException("Document already has state");
  }

  @Put("documents/:kind/:id")
  @HttpCode(204)
  async store(
    @Param("kind") kind: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() dto: StoreDocumentDto,
  ) {
    const stored = await this.inOrgOf(kind, id, (provider) =>
      provider.store(id, {
        ydoc: this.decodeState(dto.ydoc),
        fields: dto.fields,
        editors: dto.editors,
      }),
    );
    if (!stored) throw new NotFoundException("Document not found");
  }

  /** Finds the document's organization first (no context yet), then runs the provider inside it. */
  private async inOrgOf<T>(
    kind: string,
    id: string,
    run: (provider: CollabDocumentProvider) => Promise<T>,
  ): Promise<T> {
    const provider = this.registry.get(kind);
    const orgId = await provider.organizationOf(id);
    if (!orgId) throw new NotFoundException("Document not found");
    return withOrg(orgId, () => run(provider));
  }

  /** Strict base64 (re-encoding must give the same text), capped at the configured document size. */
  private decodeState(encoded: string): Buffer {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes.length === 0 || bytes.toString("base64") !== encoded) {
      throw new BadRequestException("ydoc must be base64");
    }
    if (bytes.length > this.config.maxDocBytes) {
      throw new PayloadTooLargeException("Document state is too large");
    }
    return bytes;
  }
}
