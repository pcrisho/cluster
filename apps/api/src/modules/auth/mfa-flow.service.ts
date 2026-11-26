import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { loadInstanceSettings } from "../../common/instance-settings";
import { withOrg } from "../../common/request-context";
import { AuthService, signInBlocked, type ClientMeta } from "./auth.service";
import { AuthChallengeService } from "./auth-challenge.service";
import { AuthEventsService } from "./auth-events.service";
import { LoginThrottleService } from "./login-throttle.service";
import { MfaService, mfaRequired } from "./mfa.service";
import { SessionService } from "./session.service";
import { SecurityMailService } from "./security-mail.service";
import { verifyPassword } from "./password-hash";

const mfaInvalid = () =>
  new BadRequestException({
    code: "MFA_INVALID",
    message: "That code is not valid",
  });

/** What the browser gets to scan; never the otpauth URL's other parts. */
const pick = ({ secret, qrSvg }: { secret: string; qrSvg: string }) => ({
  secret,
  qrSvg,
});

/** Who an enrollment is for: someone still in an ENROLL challenge, or the signed-in person. */
export type Enrollee =
  | { challengeId: string }
  | { userId: string; sessionId?: string };

/**
 * The HTTP flows of the second factor (docs/specs/auth/hardening R-15 to R-21): finishing a sign-in with a
 * code, enrolling, new recovery codes and turning 2FA off. Every wrong code counts towards the account's
 * lockout, like a wrong password (R-18).
 */
@Injectable()
export class MfaFlowService {
  constructor(
    private readonly system: SystemPrismaService,
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
    private readonly challenges: AuthChallengeService,
    private readonly throttle: LoginThrottleService,
    private readonly events: AuthEventsService,
    private readonly sessions: SessionService,
    private readonly securityMail: SecurityMailService,
  ) {}

  /** Finishes a VERIFY challenge with an app code or a recovery code. */
  async verify(
    input: { challengeId: string; code?: string; recoveryCode?: string },
    client: ClientMeta,
  ) {
    const userId = await this.challenges.attempt(input.challengeId, "VERIFY");
    const user = await this.person(userId);
    await this.checkCode(user, client, input.code, input.recoveryCode);
    await this.challenges.finish(input.challengeId);
    return this.complete(user, client, "MFA_VERIFIED");
  }

  /**
   * A QR to scan. From a challenge, the first device. Signed in, the password first (a stolen session
   * must not bind someone else's phone), and with 2FA on also a code or a recovery code: a new device
   * that replaces the current one only once confirmed, so 2FA never goes off on the way.
   */
  async startEnrollment(
    who: Enrollee,
    proof: { currentPassword?: string; code?: string },
    client: ClientMeta,
  ) {
    const fromChallenge = "challengeId" in who;
    const userId = fromChallenge
      ? await this.challenges.attempt(who.challengeId, "ENROLL", false)
      : who.userId;
    const [user, { name }] = await Promise.all([
      this.person(userId),
      loadInstanceSettings(this.system),
    ]);
    if (fromChallenge)
      return pick(await this.mfa.startEnrollment(userId, user.email, name));
    await this.checkPassword(user, proof.currentPassword);
    if (!(await this.mfa.isEnabled(userId)))
      return pick(await this.mfa.startEnrollment(userId, user.email, name));
    await this.checkCode(user, client, proof.code, proof.code);
    return pick(await this.mfa.startReplacement(userId, user.email, name));
  }

  /** Turns 2FA on, or moves it to the new device. From a challenge it also gives the waiting session. */
  async confirmEnrollment(who: Enrollee, code: string, client: ClientMeta) {
    const fromChallenge = "challengeId" in who;
    const userId = fromChallenge
      ? await this.challenges.attempt(who.challengeId, "ENROLL")
      : who.userId;
    const user = await this.person(userId);
    const replacing = !fromChallenge && (await this.mfa.isEnabled(userId));
    const recoveryCodes = replacing
      ? await this.mfa.confirmReplacement(userId, code)
      : await this.mfa.confirmEnrollment(userId, code);
    if (!recoveryCodes) throw mfaInvalid();
    // R-10: a change of 2FA signs out every other session.
    await this.sessions.revokeAll(
      userId,
      "MFA_CHANGED",
      fromChallenge ? undefined : who.sessionId,
    );
    await this.securityMail.notify(
      userId,
      replacing ? "mfaChanged" : "mfaEnabled",
      client,
    );
    if (fromChallenge) {
      await this.challenges.finish(who.challengeId);
      return {
        ...(await this.complete(user, client, "MFA_ENABLED")),
        recoveryCodes,
      };
    }
    await this.events.record(replacing ? "MFA_CHANGED" : "MFA_ENABLED", {
      ...client,
      userId,
      sessionId: who.sessionId,
    });
    return { recoveryCodes };
  }

  /** New recovery codes, the old ones dead; needs a code of the app. */
  async renewRecoveryCodes(
    userId: string,
    sessionId: string | undefined,
    code: string,
    client: ClientMeta,
  ) {
    await this.checkCode(await this.person(userId), client, code);
    const recoveryCodes = await this.mfa.replaceRecoveryCodes(userId);
    await this.events.record("RECOVERY_CODES_RENEWED", {
      ...client,
      userId,
      sessionId,
    });
    return { recoveryCodes };
  }

  /** R-21: the password and a code (or a recovery code); never for someone who must keep it. */
  async disable(
    userId: string,
    sessionId: string | undefined,
    input: { currentPassword: string; code: string },
    client: ClientMeta,
  ) {
    const user = await this.person(userId);
    if (mfaRequired(user))
      throw new ForbiddenException({
        code: "MFA_REQUIRED",
        message: "Two-step verification is required for your role",
      });
    await this.checkPassword(user, input.currentPassword);
    await this.checkCode(user, client, input.code, input.code);
    await this.mfa.remove(userId);
    await this.sessions.revokeAll(userId, "MFA_CHANGED", sessionId);
    await this.events.record("MFA_DISABLED", { ...client, userId, sessionId });
    await this.securityMail.notify(userId, "mfaDisabled", client);
  }

  private async checkPassword(
    user: { passwordHash: string },
    password: string | undefined,
  ) {
    if (!password || !(await verifyPassword(password, user.passwordHash)))
      throw new BadRequestException({
        code: "WRONG_PASSWORD",
        message: "Current password is incorrect",
      });
  }

  private async person(userId: string) {
    const user = await this.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        isSuperAdmin: true,
        isActive: true,
        organizationId: true,
        organization: { select: { isActive: true, requireAdminMfa: true } },
      },
    });
    if (!user.isActive || !user.organization.isActive)
      throw new ForbiddenException({
        code: "ACCOUNT_INACTIVE",
        message: "Account is not active",
      });
    return user;
  }

  /**
   * An app code (accepted once) or, when given, a recovery code (spent). A locked account is refused before
   * any check, and a wrong code counts as a failed sign-in.
   */
  private async checkCode(
    user: { id: string; email: string },
    client: ClientMeta,
    code?: string,
    recoveryCode?: string,
  ) {
    const block = await this.throttle.blocked(user.email, client.ipAddress);
    if (block) throw signInBlocked(block);
    if (code && (await this.mfa.verify(user.id, code))) return;
    if (
      recoveryCode &&
      (await this.mfa.useRecoveryCode(user.id, recoveryCode))
    ) {
      await this.events.record("RECOVERY_CODE_USED", {
        ...client,
        userId: user.id,
      });
      await this.securityMail.notify(user.id, "recoveryCodeUsed", client);
      return;
    }
    const locked = await this.throttle.failed(
      user.email,
      client.ipAddress,
      `mfa:${recoveryCode ?? code ?? ""}`,
    );
    await this.events.record("MFA_FAILED", { ...client, userId: user.id });
    if (locked)
      await this.events.record("LOGIN_LOCKED", { ...client, userId: user.id });
    throw mfaInvalid();
  }

  /** The session at the end of a sign-in; clears the account's failures like a correct password does. */
  private async complete(
    user: { id: string; email: string; organizationId: string },
    client: ClientMeta,
    event: "MFA_VERIFIED" | "MFA_ENABLED",
  ) {
    await this.throttle.succeeded(user.email);
    return withOrg(user.organizationId, () =>
      this.auth.startSession(user.id, client, event),
    );
  }
}
