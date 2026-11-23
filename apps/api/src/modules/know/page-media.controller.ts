import {
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { FileUpload } from "../storage/file-rules";
import { KnowMediaService } from "./know-media.service";
import { pageOwner } from "./media-owner";

@RequireModule(ModuleKey.KNOW)
@Controller("know/pages/:id/images")
export class PageMediaController {
  constructor(private readonly media: KnowMediaService) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @FileUpload("image")
  async upload(
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const data = await this.media.uploadImage(user, pageOwner(id), file);
    return { success: true, data };
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id") id: string,
    @Query("key") key: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.media.deleteImage(user, pageOwner(id), key);
  }
}
