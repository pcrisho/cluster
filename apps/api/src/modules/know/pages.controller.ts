import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { CreatePageDto } from "./dto/create-page.dto";
import { MovePageDto } from "./dto/move-page.dto";
import { UpdatePageDto } from "./dto/update-page.dto";
import { UpdatePageStatusDto } from "./dto/update-page-status.dto";
import { PagesService } from "./pages.service";

@RequireModule(ModuleKey.KNOW)
@Controller("know")
export class PagesController {
  constructor(private readonly pages: PagesService) {}

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("spaces/:spaceId/pages")
  tree(
    @Param("spaceId") spaceId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pages.tree(user, spaceId);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("spaces/:spaceId/pages")
  create(
    @Param("spaceId") spaceId: string,
    @Body() dto: CreatePageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pages.create(user, spaceId, dto);
  }

  @Get("pages/:id")
  get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pages.get(user, id);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch("pages/:id")
  @HttpCode(HttpStatus.OK)
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pages.update(user, id, dto);
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Patch("pages/:id/move")
  @HttpCode(HttpStatus.OK)
  move(
    @Param("id") id: string,
    @Body() dto: MovePageDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pages.move(user, id, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete("pages/:id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.pages.remove(user, id);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch("pages/:id/status")
  @HttpCode(HttpStatus.OK)
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdatePageStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.pages.updateStatus(user, id, dto);
  }
}
