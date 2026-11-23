import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
import { CourseProgressService } from "./course-progress.service";
import { CatalogQuery } from "./dto/learning.dto";
import { LearningService } from "./learning.service";

/** The learner's routes. `?preview=1` lets course managers read any course as a learner, without writing. */
@RequireModule(ModuleKey.GROW)
@Controller("grow")
export class LearningController {
  constructor(
    private readonly learning: LearningService,
    private readonly progress: CourseProgressService,
  ) {}

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("learning")
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.learning.learning(user);
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("learning/pending")
  pending(@CurrentUser() user: AuthenticatedUser) {
    return this.learning.pending(user);
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("catalog")
  catalog(
    @Query() query: CatalogQuery,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learning.catalog(user, query);
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("courses/:id")
  overview(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("preview") preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.learning.overview(user, id, preview === "1");
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Post("courses/:id/enroll")
  @HttpCode(HttpStatus.OK)
  enroll(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progress.enroll(user, id);
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("courses/:id/steps/:stepId")
  step(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @Query("preview") preview: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progress.openStep(user, id, stepId, preview === "1");
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Post("courses/:id/steps/:stepId/complete")
  @HttpCode(HttpStatus.OK)
  complete(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.progress.complete(user, id, stepId);
  }
}
