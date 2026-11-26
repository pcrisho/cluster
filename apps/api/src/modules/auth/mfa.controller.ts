import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ExtractJwt } from "passport-jwt";
import type { Request, Response } from "express";
import {
  CurrentUser,
  Public,
  type AuthenticatedUser,
} from "../../common/decorators";
import { clientOf, withSessionCookies } from "./auth.controller";
import { AuthTokens } from "./auth-tokens";
import { AuthUserService } from "./auth-user.service";
import { MfaFlowService, type Enrollee } from "./mfa-flow.service";
import { SameOrigin } from "./same-origin.guard";
import {
  MfaChallengeDto,
  MfaCodeDto,
  MfaDisableDto,
  MfaEnrollConfirmDto,
  MfaEnrollStartDto,
  MfaVerifyDto,
} from "./dto/mfa.dto";

/** Second factor (docs/specs/auth/hardening T19). Sign-in steps are public and carry a challenge. */
@Controller("auth/mfa")
export class MfaController {
  constructor(
    private readonly flow: MfaFlowService,
    private readonly tokens: AuthTokens,
    private readonly authUser: AuthUserService,
  ) {}

  @Public()
  @SameOrigin()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("verify")
  @HttpCode(HttpStatus.OK)
  async verify(
    @Body() dto: MfaVerifyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withSessionCookies(res, await this.flow.verify(dto, clientOf(req)));
  }

  /** With a challenge: the enrollment a superadmin (or a required ADMIN) must do before a session. */
  @Public()
  @SameOrigin()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("enroll/start")
  @HttpCode(HttpStatus.OK)
  async startEnrollment(@Body() dto: MfaEnrollStartDto, @Req() req: Request) {
    return this.flow.startEnrollment(
      await this.enrollee(dto, req),
      dto,
      clientOf(req),
    );
  }

  @Public()
  @SameOrigin()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("enroll/confirm")
  @HttpCode(HttpStatus.OK)
  async confirmEnrollment(
    @Body() dto: MfaEnrollConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withSessionCookies(
      res,
      await this.flow.confirmEnrollment(
        await this.enrollee(dto, req),
        dto.code,
        clientOf(req),
      ),
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("recovery-codes")
  @HttpCode(HttpStatus.OK)
  renewRecoveryCodes(
    @Body() dto: MfaCodeDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.flow.renewRecoveryCodes(
      user.id,
      user.sessionId,
      dto.code,
      clientOf(req),
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  disable(
    @Body() dto: MfaDisableDto,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
  ) {
    return this.flow.disable(user.id, user.sessionId, dto, clientOf(req));
  }

  /** The challenge holder, or else the bearer of a live access token (the route is public for the first). */
  private async enrollee(
    dto: MfaChallengeDto,
    req: Request,
  ): Promise<Enrollee> {
    if (dto.challengeId) return { challengeId: dto.challengeId };
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    const claims = token ? this.tokens.verify(token, ["access"]) : null;
    if (!claims) throw new UnauthorizedException();
    const user = await this.authUser.load(claims.sub, claims.sid);
    return { userId: user.id, sessionId: claims.sid };
  }
}
