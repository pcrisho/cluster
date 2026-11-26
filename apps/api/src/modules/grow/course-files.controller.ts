import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
} from "@nestjs/common";
import type { Request } from "express";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { FileUpload } from "../storage/file-rules";
import { CourseFilesService } from "./course-files.service";

/** The one route that may take an hour to receive its body (`main.ts` keeps every other at 5 min). */
export const isLessonVideoUpload = (req: Pick<Request, "method" | "path">) =>
  req.method === "PUT" &&
  /^\/api\/v1\/grow\/steps\/[^/]+\/video$/.test(req.path);

@RequireModule(ModuleKey.GROW)
@Controller("grow")
export class CourseFilesController {
  constructor(private readonly files: CourseFilesService) {}

  /** A document for a files lesson (50 MB, office documents, text or ZIP). The lesson stores the returned key. */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("courses/:id/files")
  @FileUpload("document")
  upload(
    @Param("id", ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.files.upload(user, id, file);
  }

  /**
   * The lesson's video (MP4 or WebM, up to 1 GB), replacing any previous one. The body is the file
   * itself, with its size in Content-Length and its name in `?name=`. Returns the saved step.
   */
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Put("steps/:id/video")
  uploadVideo(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("name") name: unknown,
    @Req() req: Request,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.files.uploadVideo(user, id, req, name);
  }
}
