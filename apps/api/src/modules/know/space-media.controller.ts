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
import { spaceOwner } from "./media-owner";

/** Images of a space description (MANAGE to write). */
@RequireModule(ModuleKey.KNOW)
@Controller("know/spaces/:id/images")
export class SpaceMediaController {
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
    const data = await this.media.uploadImage(user, spaceOwner(id), file);
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
    await this.media.deleteImage(user, spaceOwner(id), key);
  }
}
