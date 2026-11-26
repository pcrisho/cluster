import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { ImportMarkdownDto } from "./dto/import-markdown.dto";
import { PageMarkdownService } from "./page-markdown.service";

@RequireModule(ModuleKey.KNOW)
@Controller("know")
export class PageMarkdownController {
  constructor(private readonly markdown: PageMarkdownService) {}

  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post("spaces/:spaceId/pages/import")
  @HttpCode(HttpStatus.CREATED)
  import(
    @Param("spaceId") spaceId: string,
    @Body() dto: ImportMarkdownDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.markdown.import(user, spaceId, dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Get("pages/:id/export")
  export(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.markdown.export(user, id);
  }
}
