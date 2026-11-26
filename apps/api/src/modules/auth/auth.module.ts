import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthUserService } from "./auth-user.service";
import { JwtStrategy } from "./jwt.strategy";
import { InvitationService } from "./invitation.service";
import { AuthTokens } from "./auth-tokens";
import { SessionService } from "./session.service";
import { PasswordLinksService } from "./password-links.service";
import { AuthEventsService } from "./auth-events.service";
import { AuthKeys } from "./auth-keys";
import { LoginThrottleService } from "./login-throttle.service";
import { MfaService } from "./mfa.service";
import { MfaController } from "./mfa.controller";
import { SessionsController } from "./sessions.controller";
import { SecurityMailService } from "./security-mail.service";
import { MfaFlowService } from "./mfa-flow.service";
import { AuthChallengeService } from "./auth-challenge.service";
import { InvitationSender } from "./invitation-sender";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [
    MailModule,
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>("JWT_SECRET"),
        signOptions: { expiresIn: "15m" },
      }),
    }),
  ],
  controllers: [AuthController, MfaController, SessionsController],
  providers: [
    AuthService,
    AuthUserService,
    JwtStrategy,
    InvitationService,
    AuthTokens,
    SessionService,
    PasswordLinksService,
    AuthEventsService,
    AuthKeys,
    LoginThrottleService,
    MfaService,
    MfaFlowService,
    AuthChallengeService,
    SecurityMailService,
    InvitationSender,
  ],
  exports: [
    SecurityMailService,
    MfaService,
    AuthEventsService,
    AuthKeys,
    AuthService,
    AuthUserService,
    InvitationService,
    AuthTokens,
    SessionService,
  ],
})
export class AuthModule {}
