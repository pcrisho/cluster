import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { Prisma, UserRole } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import {
  effectiveModules,
  loadInstanceSettings,
} from "../../common/instance-settings";
import { canCustomize, seedsOf } from "../../common/theme";
import { slugify } from "../../common/slugify";
import { effectiveLocale } from "../../common/locale";
import { bestEffort } from "../../common/best-effort";
import { withOrg } from "../../common/request-context";
import type { AuthenticatedUser } from "../../common/decorators";
import { assertOwnProfileEditable } from "../org/profile-lock";
import { StorageService } from "../storage/storage.service";
import { isOwnUploadKey } from "../storage/file-url";
import { InvitationService } from "./invitation.service";
import { AuthEventsService, type AuthEventType } from "./auth-events.service";
import {
  hashPassword,
  UNUSABLE_PASSWORD,
  verifyPassword,
} from "./password-hash";
import { checkPassword, type PasswordContext } from "./password-policy";
import { isBreached } from "./breach-check";
import {
  LoginThrottleService,
  type SignInBlock,
} from "./login-throttle.service";
import { AuthTokens } from "./auth-tokens";
import { SessionService, type SessionRef } from "./session.service";
import { MfaService, mfaRequired } from "./mfa.service";
import { SecurityMailService } from "./security-mail.service";
import {
  AuthChallengeService,
  challengeEnded,
  type ChallengePurpose,
} from "./auth-challenge.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import {
  ChangePasswordDto,
  SetInitialPasswordDto,
  SetPasswordDto,
} from "./dto/password.dto";

const ACCESS_TOKEN_SECONDS = 15 * 60;

/** Where a sign-in comes from; stored on the session so the person can recognize it. */
export interface ClientMeta {
  userAgent?: string | null;
  ipAddress?: string | null;
}

const sessionEnded = () =>
  new UnauthorizedException({
    code: "SESSION_ENDED",
    message: "The session has ended, sign in again",
  });

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly tokens: AuthTokens,
    private readonly sessions: SessionService,
    private readonly invitations: InvitationService,
    private readonly events: AuthEventsService,
    private readonly throttle: LoginThrottleService,
    private readonly storage: StorageService,
    private readonly mfa: MfaService,
    private readonly challenges: AuthChallengeService,
    private readonly securityMail: SecurityMailService,
  ) {}

  /** Public sign-up: only when the instance allows it. Creates an org with the caller as ADMIN. */
  async register(dto: RegisterDto, client: ClientMeta = {}) {
    const settings = await loadInstanceSettings(this.system);
    if (!settings.registrationOpen) {
      throw new ForbiddenException({
        code: "REGISTRATION_CLOSED",
        message: "Public registration is disabled on this instance",
      });
    }

    await this.assertNewPassword(dto.password, {
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      organizationName: dto.organizationName,
    });
    const { organization, user } = await this.provisionOrganization({
      name: dto.organizationName,
      timezone: dto.timezone,
      admin: {
        email: dto.email,
        firstName: dto.firstName,
        lastName: dto.lastName,
        password: dto.password,
      },
    });
    return withOrg(organization.id, () =>
      this.startSession(user.id, client, "LOGIN_OK"),
    );
  }

  async login(dto: LoginDto, client: ClientMeta = {}) {
    // Refused before the password is checked: same answer whether the account exists or not.
    const block = await this.throttle.blocked(dto.email, client.ipAddress);
    if (block) throw signInBlocked(block);

    const user = await this.system.user.findUnique({
      where: { email: normalizeEmail(dto.email) },
      include: { organization: { select: { isActive: true } } },
    });
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash ?? null,
    );
    // An initial password (a time was set for it) stops working when that time runs out (access-without-mail).
    const expired =
      !!user &&
      valid &&
      user.tempPasswordExpiresAt !== null &&
      user.tempPasswordExpiresAt <= new Date();
    const failed = (reason: string) =>
      this.events.record("LOGIN_FAILED", {
        ...client,
        userId: user?.id,
        email: user ? undefined : dto.email,
        detail: { reason },
      });
    if (!user || !valid || expired) {
      const locked = await this.throttle.failed(
        dto.email,
        client.ipAddress,
        dto.password,
      );
      await failed(
        !user ? "NO_ACCOUNT" : expired ? "INITIAL_EXPIRED" : "WRONG_PASSWORD",
      );
      if (locked)
        await this.events.record("LOGIN_LOCKED", {
          ...client,
          userId: user?.id,
          email: user ? undefined : dto.email,
        });
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Invalid credentials",
      });
    }
    if (!user.isActive) {
      await failed("ACCOUNT_INACTIVE");
      throw new ForbiddenException({
        code: "ACCOUNT_INACTIVE",
        message: "Account is deactivated",
      });
    }
    if (!user.organization.isActive) {
      await failed("ORG_SUSPENDED");
      throw new ForbiddenException({
        code: "ORG_SUSPENDED",
        message: "Organization is suspended",
      });
    }

    return this.signIn(user.id, client, "LOGIN_OK");
  }

  /**
   * After a correct password: a session, or first the 2FA step (R-17, R-19) with no cookie and no access.
   * The account's failure counter clears only once a session is given, so 2FA failures keep counting.
   */
  private async signIn(
    userId: string,
    client: ClientMeta,
    event: AuthEventType,
  ): Promise<SessionTokens | { mfa: ChallengePurpose; challengeId: string }> {
    const user = await this.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        email: true,
        role: true,
        isSuperAdmin: true,
        tempPasswordExpiresAt: true,
        organizationId: true,
        organization: { select: { requireAdminMfa: true } },
      },
    });
    // Signed in with an initial password: they set their own before anything else.
    const purpose: ChallengePurpose | null =
      user.tempPasswordExpiresAt !== null
        ? "PASSWORD_CHANGE"
        : (await this.mfa.isEnabled(userId))
          ? "VERIFY"
          : mfaRequired(user)
            ? "ENROLL"
            : null;
    if (purpose) {
      await this.events.record(event, {
        ...client,
        userId,
        detail: { pending: purpose },
      });
      const challengeId = await this.challenges.create(userId, purpose, client);
      return { mfa: purpose, challengeId };
    }
    await this.throttle.succeeded(user.email);
    return withOrg(user.organizationId, () =>
      this.startSession(userId, client, event),
    );
  }

  /**
   * Creates an organization and its first ADMIN in one transaction. Without
   * a password the admin is created as "invitation pending".
   */
  async provisionOrganization(input: {
    name: string;
    /** IANA zone; UTC when the caller does not know it. */
    timezone?: string;
    admin: {
      email: string;
      firstName: string;
      lastName: string;
      password?: string;
    };
  }) {
    const slug = slugify(input.name) || `org-${randomUUID().slice(0, 8)}`;
    const settings = await loadInstanceSettings(this.system);

    // System client: the organization does not exist yet, so there is no context to run in.
    return this.system.$transaction(async (tx) => {
      const existingOrg = await tx.organization.findUnique({ where: { slug } });
      if (existingOrg) {
        throw new ConflictException({
          code: "ORG_NAME_TAKEN",
          message: "An organization with a similar name already exists",
        });
      }
      const organization = await tx.organization.create({
        data: {
          name: input.name.trim(),
          slug,
          ...(input.timezone && { timezone: input.timezone }),
          enabledModules: settings.availableModules,
        },
      });
      const user = await this.createAccount(
        {
          ...input.admin,
          organizationId: organization.id,
          role: UserRole.ADMIN,
        },
        tx,
      );
      return { organization, user };
    });
  }

  /**
   * Single place where users are created. Without a password the account gets
   * an unusable hash and `passwordSetAt = null` until the invitation is accepted.
   */
  async createAccount(
    input: {
      organizationId: string;
      email: string;
      firstName: string;
      lastName: string;
      role: UserRole;
      password?: string;
    },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    const email = normalizeEmail(input.email);
    // No password: the invitation is pending, and it costs no bcrypt until someone sets one.
    const passwordHash = input.password
      ? await hashPassword(input.password)
      : UNUSABLE_PASSWORD;
    // The unique index decides: under RLS a pre-check cannot see an email taken in another organization.
    try {
      return await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          role: input.role,
          organizationId: input.organizationId,
          passwordSetAt: input.password ? new Date() : null,
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        throw new ConflictException({
          code: "EMAIL_TAKEN",
          message: "Email already registered",
        });
      throw e;
    }
  }

  /**
   * The bulk form of `createAccount` (docs/specs/org/bulk-import): pending COLLABORATOR accounts with ids given by
   * the caller, in one statement. A duplicate e-mail surfaces as the unique-index error (P2002) for the caller to map.
   */
  async createAccounts(
    rows: {
      id: string;
      organizationId: string;
      email: string;
      firstName: string;
      lastName: string;
      orgColaboratorId?: string | null;
      inviteQueuedAt?: Date;
    }[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.user.createMany({
      data: rows.map((row) => ({
        ...row,
        email: normalizeEmail(row.email),
        firstName: row.firstName.trim(),
        lastName: row.lastName.trim(),
        role: UserRole.COLLABORATOR,
        passwordHash: UNUSABLE_PASSWORD,
        passwordSetAt: null,
      })),
    });
  }

  /** Which of `emails` belong to another organization. Only addresses come back, never whose they are (system client: RLS hides them). */
  async emailsElsewhere(orgId: string, emails: string[]): Promise<Set<string>> {
    if (emails.length === 0) return new Set();
    const users = await this.system.user.findMany({
      where: { email: { in: emails }, organizationId: { not: orgId } },
      select: { email: true },
    });
    return new Set(users.map((u) => u.email));
  }

  /** Accepts an invitation or a password reset link and signs the user in. */
  async setPassword(dto: SetPasswordDto, client: ClientMeta = {}) {
    const linkInvalid = () =>
      new BadRequestException({
        code: "LINK_INVALID",
        message: "This link is invalid or has expired",
      });
    // The new password is checked before the link is spent, so a refused one keeps the link usable.
    const peeked = await this.invitations.peekToken(dto.token);
    if (!peeked) throw linkInvalid();
    const user = await this.system.user.findUnique({
      where: { id: peeked },
      include: { organization: { select: { isActive: true, name: true } } },
    });
    if (user) await this.assertNewPassword(dto.password, policyContext(user));

    const link = await this.invitations.consumeToken(dto.token);
    if (!link) throw linkInvalid();
    const { userId } = link;

    if (!user || !user.isActive || !user.organization.isActive) {
      throw new ForbiddenException({
        code: "ACCOUNT_INACTIVE",
        message: "Account is not active",
      });
    }

    // A reset must kick out any session opened with the old password; revoke first so a
    // failure never leaves the new password in place with the old sessions alive.
    await this.sessions.revokeAll(userId, "PASSWORD_RESET");
    const passwordHash = await hashPassword(dto.password);
    await withOrg(user.organizationId, async () => {
      await this.prisma.user.update({
        where: { id: userId },
        // A RESET link may be used while an initial password is still live: it ends here.
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          tempPasswordExpiresAt: null,
        },
      });
    });
    if (link.purpose === "RESET")
      await this.securityMail.notify(userId, "passwordReset", client);
    // A reset link proves the mailbox only: someone with 2FA still gives a code.
    return this.signIn(
      userId,
      client,
      link.purpose === "INVITE" ? "INVITE_ACCEPTED" : "PASSWORD_RESET",
    );
  }

  /**
   * The step after an initial password: the person sets their own, the initial password and any link
   * are gone, and the sign-in carries on (2FA when due, then the session).
   */
  async setInitialPassword(
    dto: SetInitialPasswordDto,
    client: ClientMeta = {},
  ) {
    const userId = await this.challenges.attempt(
      dto.challengeId,
      "PASSWORD_CHANGE",
    );
    const user = await this.system.user.findUnique({
      where: { id: userId },
      include: { organization: { select: { isActive: true, name: true } } },
    });
    const live =
      !!user &&
      !!user.tempPasswordExpiresAt &&
      user.tempPasswordExpiresAt > new Date();
    if (!user || !live) throw challengeEnded();
    if (!user.isActive || !user.organization.isActive) {
      throw new ForbiddenException({
        code: "ACCOUNT_INACTIVE",
        message: "Account is not active",
      });
    }
    // The policy first: a refused password keeps the step usable.
    await this.assertNewPassword(dto.password, policyContext(user));
    await this.challenges.finish(dto.challengeId);
    const passwordHash = await hashPassword(dto.password);
    await withOrg(user.organizationId, async () => {
      // Awaited inside the organization: a Prisma promise takes the context where it is awaited.
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordSetAt: new Date(),
          tempPasswordExpiresAt: null,
        },
      });
    });
    await this.system.passwordLink.deleteMany({ where: { userId } });
    return this.signIn(userId, client, "INVITE_ACCEPTED");
  }

  /** Always resolves, so the endpoint does not reveal which emails exist. */
  async forgotPassword(email: string) {
    const user = await this.system.user.findUnique({
      where: { email: normalizeEmail(email) },
      select: {
        id: true,
        email: true,
        firstName: true,
        isActive: true,
        organizationId: true,
      },
    });
    if (!user?.isActive) return;
    // Not awaited: the answer must not wait for SMTP, or its timing would tell the account exists.
    void withOrg(user.organizationId, () =>
      bestEffort(`password reset email to user ${user.id}`, () =>
        this.invitations.sendPasswordReset(user),
      ),
    );
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    client: ClientMeta = {},
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: { select: { name: true } } },
    });
    if (!user) throw new UnauthorizedException("User not found");
    const valid = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!valid)
      throw new BadRequestException({
        code: "WRONG_PASSWORD",
        message: "Current password is incorrect",
      });
    await this.assertNewPassword(dto.newPassword, policyContext(user));

    // Whoever else holds a session (a stolen token included) is signed out; the device
    // that changed the password gets a fresh session.
    await this.sessions.revokeAll(userId, "PASSWORD_CHANGED");
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: await hashPassword(dto.newPassword),
        passwordSetAt: new Date(),
      },
    });
    await this.securityMail.notify(userId, "passwordChanged", client);
    return this.startSession(userId, client, "PASSWORD_CHANGED");
  }

  async refresh(refreshToken: string, client: ClientMeta = {}) {
    const result = await this.sessions.rotate(refreshToken);
    if (result.kind === "reuse") {
      this.logger.warn(
        `Refresh token reuse for user ${result.userId}, session ${result.sessionId}: every session revoked`,
      );
      await this.events.record("REFRESH_REUSE", {
        ...client,
        userId: result.userId,
        sessionId: result.sessionId,
      });
    }
    if (result.kind !== "rotated") throw sessionEnded();

    const user = await this.system.user.findUnique({
      where: { id: result.session.userId },
      select: {
        isActive: true,
        organizationId: true,
        organization: { select: { isActive: true } },
      },
    });
    if (!user || !user.isActive || !user.organization.isActive)
      throw sessionEnded();
    return withOrg(user.organizationId, () =>
      this.sessionTokens(result.session, result.refreshToken),
    );
  }

  /** Ends the session the refresh token belongs to; an unknown or spent token is ignored. */
  async logout(refreshToken: string, client: ClientMeta = {}) {
    const ended = await this.sessions.revokeByToken(refreshToken, "LOGOUT");
    if (ended)
      await this.events.record("LOGOUT", {
        ...client,
        userId: ended.userId,
        sessionId: ended.id,
      });
  }

  async me(userId: string) {
    return { user: await this.getAuthUser(userId) };
  }

  async updateProfile(user: AuthenticatedUser, dto: UpdateProfileDto) {
    const { id: userId, orgId } = user;
    if (
      dto.firstName !== undefined ||
      dto.lastName !== undefined ||
      dto.avatarUrl !== undefined
    ) {
      await assertOwnProfileEditable(this.prisma, user);
    }
    if (dto.avatarUrl && !isOwnUploadKey(orgId, dto.avatarUrl)) {
      throw new BadRequestException(
        "Images must be uploaded through /files/images",
      );
    }
    const before =
      dto.avatarUrl !== undefined
        ? await this.prisma.user.findUnique({
            where: { id: userId },
            select: { avatarUrl: true },
          })
        : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        ...(dto.locale !== undefined && { locale: dto.locale }),
      },
    });
    const old = before?.avatarUrl;
    if (old && old !== dto.avatarUrl && isOwnUploadKey(orgId, old)) {
      await bestEffort("delete replaced avatar", () =>
        this.storage.deleteFile(old),
      );
    }
    return this.me(userId);
  }

  /**
   * The user as the web app needs it: profile fields, organization and the
   * effective modules (instance availableModules ∩ organization enabledModules).
   */
  async getAuthUser(userId: string) {
    const [user, settings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          avatarUrl: true,
          locale: true,
          isSuperAdmin: true,
          organizationId: true,
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              timezone: true,
              logoUrl: true,
              locale: true,
              enabledModules: true,
              brandPrimary: true,
              brandSecondary: true,
              fontKey: true,
              radiusKey: true,
              themingEnabled: true,
              requireAdminMfa: true,
              memberProfileEditing: true,
              isolateRootNodes: true,
            },
          },
          capabilities: { select: { capability: true } },
          _count: { select: { managedOrgNodes: true } },
        },
      }),
      loadInstanceSettings(this.prisma),
    ]);
    if (!user) throw new UnauthorizedException("User not found");
    const mfaEnabled = await this.mfa.isEnabled(userId);
    const recoveryCodesLeft = mfaEnabled
      ? await this.mfa.remainingRecoveryCodes(userId)
      : null;

    const {
      enabledModules,
      brandPrimary,
      brandSecondary,
      fontKey,
      radiusKey,
      themingEnabled,
      requireAdminMfa,
      isolateRootNodes,
      ...organization
    } = user.organization;
    const themingAllowed = canCustomize(settings, { themingEnabled });
    const seeds = seedsOf({ brandPrimary, brandSecondary, fontKey, radiusKey });
    const { _count, ...rest } = user;
    return {
      ...rest,
      organization: {
        ...organization,
        themingAllowed,
        // Effective: the instance switch and the organization's own (docs/specs/org/node-partitions).
        isolated: settings.nodeIsolationAllowed && isolateRootNodes,
        // Stored seeds stay in the row while a switch is off; they just stop applying.
        theme:
          themingAllowed && Object.values(seeds).some((v) => v !== null)
            ? seeds
            : null,
      },
      capabilities: user.capabilities.map((c) => c.capability),
      // Area managers see the reports of their areas.
      managesArea: _count.managedOrgNodes > 0,
      modules: effectiveModules(settings.availableModules, enabledModules),
      mfaEnabled,
      recoveryCodesLeft,
      mfaRequired: mfaRequired({
        ...user,
        organization: { requireAdminMfa },
      }),
      effectiveLocale: effectiveLocale(
        user.locale,
        organization.locale,
        settings.defaultLocale,
      ),
    };
  }

  /**
   * Refuses a new password the policy rejects, then, when the superadmin turned it on, one found in
   * Have I Been Pwned. If that service cannot answer, the password is accepted and the miss recorded.
   */
  private async assertNewPassword(password: string, ctx: PasswordContext) {
    assertPassword(password, ctx);
    const { passwordBreachCheck } = await loadInstanceSettings(this.system);
    if (!passwordBreachCheck) return;
    const breached = await isBreached(password);
    if (breached === null) {
      this.logger.warn(
        "Password breach check unavailable; the password was accepted",
      );
      await this.events.record("BREACH_CHECK_UNAVAILABLE", {
        email: ctx.email,
      });
    } else if (breached) {
      throw new BadRequestException({
        code: "PASSWORD_BREACHED",
        message: "This password appears in known data breaches",
      });
    }
  }

  /** A new session on this device, its tokens, and the event that opened it. Runs in the person's organization. */
  async startSession(userId: string, client: ClientMeta, event: AuthEventType) {
    const { isSuperAdmin } = await this.system.user.findUniqueOrThrow({
      where: { id: userId },
      select: { isSuperAdmin: true },
    });
    const { session, refreshToken } = await this.sessions.create({
      userId,
      superAdmin: isSuperAdmin,
      ...client,
    });
    await this.events.record(event, {
      ...client,
      userId,
      sessionId: session.id,
    });
    return this.sessionTokens(session, refreshToken);
  }

  /** The user and the tokens of a live session: access for 15 min, file for the life of the session. */
  private async sessionTokens(
    session: SessionRef,
    refreshToken: string,
  ): Promise<SessionTokens> {
    const user = await this.getAuthUser(session.userId);
    const claims = { sub: session.userId, sid: session.id };
    const fileSeconds = Math.max(
      1,
      Math.floor((session.absoluteExpiresAt.getTime() - Date.now()) / 1000),
    );
    return {
      user,
      accessToken: this.tokens.sign("access", claims, ACCESS_TOKEN_SECONDS),
      refreshToken,
      fileToken: this.tokens.sign("file", claims, fileSeconds),
      sessionExpiresAt: session.absoluteExpiresAt,
    };
  }
}

/** What the controller turns into cookies and a JSON body. */
export interface SessionTokens {
  user: Awaited<ReturnType<AuthService["getAuthUser"]>>;
  accessToken: string;
  refreshToken: string;
  fileToken: string;
  sessionExpiresAt: Date;
}

const normalizeEmail = (email: string) => email.trim().toLowerCase();

/** 429 for a locked account (the wait in minutes, for the message) or an address over its ceiling. */
export function signInBlocked({ scope, retryAfterMs }: SignInBlock) {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return new HttpException(
    scope === "account"
      ? {
          code: "ACCOUNT_LOCKED",
          message: "Too many failed sign-ins for this account; try again later",
          params: { minutes },
        }
      : {
          code: "TOO_MANY_REQUESTS",
          message:
            "Too many failed sign-ins from this address; try again later",
        },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

const policyContext = (user: {
  email: string;
  firstName: string;
  lastName: string;
  organization: { name: string };
}): PasswordContext => ({ ...user, organizationName: user.organization.name });

/** Refuses a new password the policy rejects, with a code the web translates (and its limit). */
function assertPassword(password: string, ctx: PasswordContext) {
  const problem = checkPassword(password, ctx);
  if (!problem) return;
  const messages = {
    PASSWORD_TOO_SHORT: "Password is too short",
    PASSWORD_TOO_LONG: "Password is too long",
    PASSWORD_TOO_COMMON: "Password is too common or too easy to guess",
  };
  throw new BadRequestException({
    ...problem,
    message: messages[problem.code],
  });
}
