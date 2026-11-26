import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ModuleKey } from "@prisma/client";
import {
  Actor,
  CurrentUser,
  RequireModule,
  type ActorContext,
  type AuthenticatedUser,
} from "../../common/decorators";
import { CoursesService } from "./courses.service";
import {
  CreateCourseDto,
  ManageCoursesQuery,
  UpdateCourseDto,
} from "./dto/course.dto";

@RequireModule(ModuleKey.GROW)
@Controller("grow")
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("manage/courses")
  list(
    @Query() query: ManageCoursesQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.listForManager(user, query);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("courses")
  create(
    @Body() dto: CreateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.courses.create(user, actor, dto);
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("courses/:id/edit")
  edit(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.courses.getForEdit(user, id);
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Patch("courses/:id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.courses.update(user, actor, id, dto);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete("courses/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    await this.courses.remove(user, actor, id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("courses/:id/publish")
  @HttpCode(HttpStatus.OK)
  publish(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.courses.publish(user, actor, id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("courses/:id/archive")
  @HttpCode(HttpStatus.OK)
  archive(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.courses.archive(user, actor, id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("courses/:id/restore")
  @HttpCode(HttpStatus.OK)
  restore(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.courses.restore(user, actor, id);
  }
}
