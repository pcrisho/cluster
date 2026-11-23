import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
import {
  AllowFileCookie,
  CurrentUser,
  type AuthenticatedUser,
} from "../../common/decorators";
import { FileAccessRegistry } from "./file-access.registry";
import { StorageService } from "./storage.service";
import { fileUrl, orgKeyPrefix } from "./file-url";
import { acceptFile, FileUpload } from "./file-rules";
import { parseByteRange } from "./byte-range";

/**
 * Single read path for stored files. The bucket is private: every file is
 * served here, only to people who may read what it belongs to (`FileAccessRegistry`).
 * <img>/CSS/downloads/<video> authenticate with the httpOnly file cookie. Byte ranges let a
 * video start and seek without downloading the whole file.
 */
@Controller("files")
export class FilesController {
  constructor(
    private readonly storage: StorageService,
    private readonly access: FileAccessRegistry,
  ) {}

  @AllowFileCookie()
  @Throttle({ default: { limit: 2000, ttl: 60000 } })
  @Get("*key")
  async get(
    // Express 5 named wildcard: the path segments after files/
    @Param("key") segments: string[],
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const key = segments.join("/");
    // Files someone may not read (another organization, a space or course they cannot see, path tricks) look missing.
    if (!(await this.access.canRead(user, key))) {
      throw new NotFoundException("File not found");
    }
    const size = await this.storage.fileSize(key);
    const range = parseByteRange(req.headers.range, size);
    if (range === "unsatisfiable") {
      res.status(416).set("Content-Range", `bytes */${size}`).end();
      return;
    }
    const { stream, contentType } = await this.storage.getFileStream(
      key,
      range ?? undefined,
    );
    res.set({
      "Content-Type": contentType,
      "Content-Length": String(range ? range.end - range.start + 1 : size),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Neutralizes scripts if a file (e.g. SVG) is opened directly on the API origin. A video
      // opened on its own is a media document: it needs media-src and its own origin to load.
      "Content-Security-Policy": contentType.startsWith("video/")
        ? "default-src 'none'; media-src 'self'; style-src 'unsafe-inline'; sandbox allow-same-origin"
        : "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    if (range)
      res
        .status(206)
        .set("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    // pipeline closes the storage stream when the browser cancels (it does on every seek).
    await pipeline(stream, res).catch(() => undefined);
  }

  /** Generic image upload (avatars, post images). Returns the key to persist and its URL. */
  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("images")
  @FileUpload("image")
  async uploadImage(
    @UploadedFile() upload: Express.Multer.File | undefined,
    @CurrentUser("orgId") orgId: string,
  ) {
    const { file, extension } = await acceptFile("image", upload);
    const key = `${orgKeyPrefix(orgId)}uploads/${randomUUID()}.${extension}`;
    await this.storage.putObject(key, file);
    return { key, url: fileUrl(key) };
  }
}
