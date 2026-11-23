import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  Req,
  Res,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { AuthService, type ClientMeta } from "./auth.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  SetInitialPasswordDto,
  SetPasswordDto,
} from "./dto/password.dto";
import { SameOrigin } from "./same-origin.guard";
import {
  CurrentUser,
  type AuthenticatedUser,
  FILE_COOKIE,
  Public,
  SESSION_COOKIE,
} from "../../common/decorators";
import { readCookie } from "../../common/cookies";
import type { CookieOptions, Request, Response } from "express";

@Controller("auth")
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Public()
  @SameOrigin()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("register")
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withSessionCookies(
      res,
      await this.authService.register(dto, clientOf(req)),
    );
  }

  @Public()
  @SameOrigin()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withSessionCookies(
      res,
      await this.authService.login(dto, clientOf(req)),
    );
  }

  /** Authenticated by the session cookie alone, hence the required origin (CSRF). */
  @Public()
  @SameOrigin({ required: true })
  @Throttle({
    default: { limit: 30, ttl: 60000 },
    auth: { limit: 300, ttl: 60000 },
  })
  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return withSessionCookies(
        res,
        await this.authService.refresh(sessionCookieOf(req), clientOf(req)),
      );
    } catch (err) {
      // An ended session leaves no cookie behind for the browser to keep sending.
      clearSessionCookies(res);
      throw err;
    }
  }

  /** Public: a signed-out tab with an expired access token must still be able to end its session. */
  @Public()
  @SameOrigin({ required: true })
  @Throttle({
    default: { limit: 10, ttl: 60000 },
    auth: { limit: 300, ttl: 60000 },
  })
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    clearSessionCookies(res);
    try {
      await this.authService.logout(sessionCookieOf(req), clientOf(req));
    } catch (err) {
      // Never answer "signed out" while the session may still be alive.
      this.logger.error("Logout could not revoke the session", err);
      throw new ServiceUnavailableException({
        code: "UNAVAILABLE",
        message:
          "Sign-out is temporarily unavailable, please try again shortly",
      });
    }
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @Get("me")
  me(@CurrentUser("id") userId: string) {
    return this.authService.me(userId);
  }

  @Throttle({ default: { limit: 60, ttl: 60000 } })
  @Patch("me")
  @HttpCode(HttpStatus.OK)
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.updateProfile(user, dto);
  }

  /** Signs out every other session; answers with a fresh session for this device. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Patch("me/password")
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Body() dto: ChangePasswordDto,
    @CurrentUser("id") userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withSessionCookies(
      res,
      await this.authService.changePassword(userId, dto, clientOf(req)),
    );
  }

  /** The step after an initial password (docs/specs/auth/access-without-mail): the person sets their own. */
  @Public()
  @SameOrigin()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("password/initial")
  @HttpCode(HttpStatus.OK)
  async setInitialPassword(
    @Body() dto: SetInitialPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withSessionCookies(
      res,
      await this.authService.setInitialPassword(dto, clientOf(req)),
    );
  }

  /** Accepts an invitation or a password-reset link. */
  @Public()
  @SameOrigin()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("set-password")
  @HttpCode(HttpStatus.OK)
  async setPassword(
    @Body() dto: SetPasswordDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return withSessionCookies(
      res,
      await this.authService.setPassword(dto, clientOf(req)),
    );
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("forgot-password")
  @HttpCode(HttpStatus.NO_CONTENT)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }
}

/** Shown in the person's list of sessions. `req.ip` honours TRUST_PROXY. */
export const clientOf = (req: Request): ClientMeta => ({
  userAgent: req.headers["user-agent"] ?? null,
  ipAddress: req.ip ?? null,
});

const sessionCookieOf = (req: Request) =>
  readCookie(req.headers.cookie, SESSION_COOKIE) ?? "";

const secure = () => (process.env.WEB_URL ?? "").startsWith("https://");

// Both httpOnly, so page scripts never see them. The file cookie is Lax (sent on same-site
// <img>/CSS/link requests) and read-only; the session cookie is Strict and only reaches /auth.
const fileCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: "lax",
  secure: secure(),
  path: "/api/v1",
});
const sessionCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  sameSite: "strict",
  secure: secure(),
  path: "/api/v1/auth",
});

type SessionCookies = {
  refreshToken: string;
  fileToken: string;
  sessionExpiresAt: Date;
};

/**
 * Moves the refresh and file tokens into their cookies; the JSON body carries neither. A 2FA challenge
 * (no session yet) passes through and sets nothing.
 */
export function withSessionCookies<T extends object>(
  res: Response,
  result: T,
) {
  if (!("refreshToken" in result)) return result;
  const { refreshToken, fileToken, sessionExpiresAt, ...rest } =
    result as T & SessionCookies;
  const maxAge = Math.max(0, sessionExpiresAt.getTime() - Date.now());
  res.cookie(SESSION_COOKIE, refreshToken, {
    ...sessionCookieOptions(),
    maxAge,
  });
  res.cookie(FILE_COOKIE, fileToken, { ...fileCookieOptions(), maxAge });
  return rest;
}

function clearSessionCookies(res: Response) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  res.clearCookie(FILE_COOKIE, fileCookieOptions());
}
