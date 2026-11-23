import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import {
  AllowFileCookie,
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { canPreview } from "@cluster/editor-schema";
import { pageOwner, spaceOwner } from "../know/media-owner";
import { FileUpload } from "../storage/file-rules";
import { DocumentsService } from "./documents.service";

import { ModuleKey } from "@prisma/client";
/**
 * Documents controller — HTTP layer for the transversal
 * `documents` module. See `documents.service.ts` for the full
 * service contract; this controller only adapts HTTP ↔ service
 * calls and adds per-route throttling + file-type filtering.
 *
 * Multipart notes:
 *   - When a file is uploaded with FileInterceptor, the
 *     non-file fields are placed in `req.body` (multer
 *     default). NestJS does not auto-bind them to a DTO when
 *     FileInterceptor is used, so we accept them as `@Body()`
 *     and validate them manually in the service.
 */
@RequireModule(ModuleKey.KNOW)
@Controller("know")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // ── Create document (v1) on a page or a space ──────────

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("pages/:pageId/documents")
  @HttpCode(HttpStatus.CREATED)
  @FileUpload("document")
  async create(
    @Param("pageId") pageId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.documentsService.createDocument(
      user,
      pageOwner(pageId),
      file,
      body?.name,
      body?.note,
    );
    return { success: true, data };
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("spaces/:spaceId/documents")
  @HttpCode(HttpStatus.CREATED)
  @FileUpload("document")
  async createInSpace(
    @Param("spaceId") spaceId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.documentsService.createDocument(
      user,
      spaceOwner(spaceId),
      file,
      body?.name,
      body?.note,
    );
    return { success: true, data };
  }

  // ── List documents of a page or a space ────────────────

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("pages/:pageId/documents")
  async list(
    @Param("pageId") pageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.documentsService.listDocuments(
      user,
      pageOwner(pageId),
    );
    return { success: true, data };
  }

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("spaces/:spaceId/documents")
  async listInSpace(
    @Param("spaceId") spaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.documentsService.listDocuments(
      user,
      spaceOwner(spaceId),
    );
    return { success: true, data };
  }

  // ── List versions ───────────────────────────────────────

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("documents/:id/versions")
  async versions(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.documentsService.listVersions(user, id);
    return { success: true, data };
  }

  // ── New version ─────────────────────────────────────────

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("documents/:id/versions")
  @HttpCode(HttpStatus.CREATED)
  @FileUpload("document")
  async newVersion(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { note?: string },
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.documentsService.createVersion(
      user,
      id,
      file,
      body?.note,
    );
    return { success: true, data };
  }

  // ── Restore a specific version as current ───────────────

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("documents/:id/versions/:versionId/restore")
  @HttpCode(HttpStatus.OK)
  async restoreVersion(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.documentsService.restoreVersion(
      user,
      id,
      versionId,
    );
    return { success: true, data };
  }

  // ── Stream a specific version ───────────────────────────

  // Opened as a plain link in a new tab, so it authenticates with the file cookie.
  @AllowFileCookie()
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("documents/:id/versions/:versionId/download")
  async download(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @Query("inline") inline: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { name, stream, contentType } =
      await this.documentsService.openVersion(user, id, versionId);
    // Inline only for what the in-app viewer shows (PDF, raster images); SVG and the rest download.
    const disposition =
      inline === "1" && canPreview(contentType) ? "inline" : "attachment";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", contentDisposition(disposition, name));
    res.setHeader("Cache-Control", "private, max-age=3600");
    stream.pipe(res);
  }

  // ── Delete ──────────────────────────────────────────────

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete("documents/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.documentsService.remove(user, id);
  }
}

/** RFC 6266: an ASCII fallback plus the real name in UTF-8. */
function contentDisposition(
  type: "inline" | "attachment",
  name: string,
): string {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
