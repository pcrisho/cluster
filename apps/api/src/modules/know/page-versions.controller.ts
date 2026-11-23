import {
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
import { PageVersionsService } from "./page-versions.service";

@RequireModule(ModuleKey.KNOW)
@Controller("know/pages/:id")
export class PageVersionsController {
  constructor(private readonly versions: PageVersionsService) {}

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("versions")
  @HttpCode(HttpStatus.CREATED)
  create(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.versions.create(user, id);
  }

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("versions")
  list(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.versions.list(user, id);
  }

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get("versions/:versionId")
  get(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.versions.get(user, id, versionId);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("restore/:versionId")
  restore(
    @Param("id") id: string,
    @Param("versionId") versionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.versions.restore(user, id, versionId);
  }
}
