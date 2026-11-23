import {
  Body,
  Controller,
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
import { AttemptsService } from "./attempts.service";
import { GradeAttemptDto, SubmitAttemptDto } from "./dto/attempt.dto";
import { QuizReviewsService } from "./quiz-reviews.service";

/** Quiz attempts for their learner, and the review of written answers for course managers. */
@RequireModule(ModuleKey.GROW)
@Controller("grow")
export class AttemptsController {
  constructor(
    private readonly attempts: AttemptsService,
    private readonly reviews: QuizReviewsService,
  ) {}

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("courses/:id/steps/:stepId/attempts")
  start(
    @Param("id", ParseUUIDPipe) id: string,
    @Param("stepId", ParseUUIDPipe) stepId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attempts.start(user, id, stepId);
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("attempts/:id")
  get(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attempts.get(user, id);
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post("attempts/:id/submit")
  @HttpCode(HttpStatus.OK)
  submit(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: SubmitAttemptDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.attempts.submit(user, id, dto.answers);
  }

  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get("courses/:id/reviews")
  pending(
    @Param("id", ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviews.pending(user, id);
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Patch("attempts/:id/grade")
  grade(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: GradeAttemptDto,
    @CurrentUser() user: AuthenticatedUser,
    @Actor() actor: ActorContext,
  ) {
    return this.reviews.grade(user, actor, id, dto.scores);
  }
}
