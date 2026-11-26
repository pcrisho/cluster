import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators";
import { clientOf } from "./auth.controller";
import { AuthEventsService } from "./auth-events.service";
import { SessionService } from "./session.service";

/** The signed-in person's own sessions (docs/specs/auth/hardening R-11). Someone else's id is a 404. */
@Controller("auth/sessions")
export class SessionsController {
  constructor(
    private readonly sessions: SessionService,
    private readonly events: AuthEventsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    const live = await this.sessions.listLive(user.id);
    return live.map((s) => ({ ...s, current: s.id === user.sessionId }));
  }

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async close(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Req() req: Request,
  ) {
    if (!(await this.sessions.revoke(id, "MANUAL", user.id)))
      throw new NotFoundException({
        code: "SESSION_NOT_FOUND",
        message: "Session not found",
      });
    await this.events.record("SESSION_CLOSED", {
      ...clientOf(req),
      userId: user.id,
      sessionId: id,
    });
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("close-others")
  @HttpCode(HttpStatus.NO_CONTENT)
  async closeOthers(
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    await this.sessions.revokeAll(user.id, "OTHERS_CLOSED", user.sessionId);
    await this.events.record("OTHER_SESSIONS_CLOSED", {
      ...clientOf(req),
      userId: user.id,
      sessionId: user.sessionId,
    });
  }
}
