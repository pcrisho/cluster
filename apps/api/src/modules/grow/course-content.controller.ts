import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CourseContentService } from "./course-content.service";
import {
  CreateStepDto,
  MoveSectionDto,
  MoveStepDto,
  TitleDto,
  UpdateStepDto,
} from "./dto/content.dto";

/** Sections and steps of a course. Step content routes accept up to 1 MB (see common/body-parsers.ts). */
@RequireModule(ModuleKey.GROW)
@Throttle({ default: { limit: 300, ttl: 60000 } })
@Controller("grow")
export class CourseContentController {
  constructor(private readonly content: CourseContentService) {}

  @Post("courses/:id/sections")
  addSection(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TitleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.addSection(user, id, dto.title);
  }

  @Patch("sections/:id")
  renameSection(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TitleDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.renameSection(user, id, dto.title);
  }

  @Patch("sections/:id/move")
  moveSection(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MoveSectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.moveSection(user, id, dto.position);
  }

  @Delete("sections/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSection(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.content.deleteSection(user, id);
  }

  @Post("sections/:id/steps")
  addStep(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.addStep(user, id, dto);
  }

  @Patch("steps/:id")
  updateStep(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.updateStep(user, id, dto);
  }

  @Patch("steps/:id/move")
  moveStep(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MoveStepDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.content.moveStep(user, id, dto.sectionId, dto.position);
  }

  @Delete("steps/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStep(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.content.deleteStep(user, id);
  }
}
