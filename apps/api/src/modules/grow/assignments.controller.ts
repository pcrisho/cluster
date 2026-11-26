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
import { AssignmentsService } from "./assignments.service";
import { AssignmentRulesDto, CreateAssignmentDto } from "./dto/assignment.dto";

@RequireModule(ModuleKey.GROW)
@Controller("grow")
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("courses/:id/assignments")
  list(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.assignments.list(user, id);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("courses/:id/assignments")
  add(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CreateAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.assignments.add(user, actor, id, dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch("assignments/:id")
  update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AssignmentRulesDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.assignments.update(user, actor, id, dto);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Delete("assignments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    await this.assignments.remove(user, actor, id);
  }
}
