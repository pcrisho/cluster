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
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  CurrentUser,
  RequireModule,
  type AuthenticatedUser,
} from "../../common/decorators";
import { CreateSpaceDto } from "./dto/create-space.dto";
import { UpdateSpaceDto } from "./dto/update-space.dto";
import { SpacesService } from "./spaces.service";

@RequireModule(ModuleKey.KNOW)
@Controller("know/spaces")
export class SpacesController {
  constructor(private readonly spaces: SpacesService) {}

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get()
  list(
    @Query("search") search: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.spaces.list(user, search);
  }

  @Throttle({ default: { limit: 1200, ttl: 60000 } })
  @Get(":id")
  get(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.get(user, id);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post()
  create(@Body() dto: CreateSpaceDto, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.create(user, dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  update(
    @Param("id") id: string,
    @Body() dto: UpdateSpaceDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.spaces.update(user, id, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete(":id")
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.spaces.remove(user, id);
  }
}
