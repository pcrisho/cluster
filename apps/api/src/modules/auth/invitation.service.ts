import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  PasswordLinksService,
  type LinkPurpose,
} from "./password-links.service";
import { MailService } from "../mail/mail.service";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { loadInstanceSettings } from "../../common/instance-settings";
import { effectiveLocale, type Locale } from "../../common/locale";
import { translate } from "../../i18n/translate";

const INVITE_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESET_TTL_SECONDS = 60 * 60;
// Longer than a reset the person asked for: they learn of it from the email, maybe hours later.
const MFA_RESET_TTL_SECONDS = 24 * 60 * 60;

interface Recipient {
  id: string;
  email: string;
  firstName: string;
}

/**
 * The emails with a single-use "set your password" link: invitations (new users
 * created by an admin) and password resets. The links live in PasswordLinksService.
 */
@Injectable()
export class InvitationService {
  private readonly webUrl: string;

  constructor(
    private readonly links: PasswordLinksService,
    private readonly mail: MailService,
    private readonly prisma: SystemPrismaService,
    config: ConfigService,
  ) {
    this.webUrl = config.get<string>("WEB_URL", "http://localhost:3000");
  }

  /** Uses the system client: it runs before (or outside) an organization context. E-mails go out in the recipient's language: their choice, else their organization's, else the instance default (an invitee has none yet). */
  private async localeOf(userId: string): Promise<Locale> {
    const [user, settings] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { locale: true, organization: { select: { locale: true } } },
      }),
      loadInstanceSettings(this.prisma),
    ]);
    return effectiveLocale(
      user?.locale,
      user?.organization.locale,
      settings.defaultLocale,
    );
  }

  /** Whether this instance sends e-mail (docs/specs/auth/access-without-mail); the answer of the flows says so. */
  get mailEnabled(): boolean {
    return this.mail.enabled;
  }

  /** False, and nothing is issued, when mail is off: the ADMIN hands an access link over instead. */
  async sendInvite(user: Recipient, organizationName: string): Promise<boolean> {
    if (!this.mail.enabled) return false;
    const link = await this.issueLink(user.id, "INVITE", INVITE_TTL_SECONDS);
    const locale = await this.localeOf(user.id);
    const params = {
      name: user.firstName,
      organization: organizationName,
      link,
    };
    await this.mail.send({
      to: user.email,
      subject: translate(locale, "email.invite.subject", params),
      text: translate(locale, "email.invite.text", params),
      html: translate(locale, "email.invite.html", params, { html: true }),
    });
    return true;
  }

  async sendPasswordReset(user: Recipient): Promise<void> {
    await this.sendResetLink(user, "reset", RESET_TTL_SECONDS);
  }

  /** After an ADMIN reset someone's 2FA and password: the link to set a new one. */
  async sendMfaReset(user: Recipient): Promise<void> {
    await this.sendResetLink(user, "mfaReset", MFA_RESET_TTL_SECONDS);
  }

  private async sendResetLink(
    user: Recipient,
    mail: "reset" | "mfaReset",
    ttlSeconds: number,
  ) {
    if (!this.mail.enabled) return;
    const link = await this.issueLink(user.id, "RESET", ttlSeconds);
    const locale = await this.localeOf(user.id);
    const params = { name: user.firstName, link };
    await this.mail.send({
      to: user.email,
      subject: translate(locale, `email.${mail}.subject`, params),
      text: translate(locale, `email.${mail}.text`, params),
      html: translate(locale, `email.${mail}.html`, params, { html: true }),
    });
  }

  /** Whom a live token was issued for, without consuming it. */
  peekToken(token: string) {
    return this.links.peek(token);
  }

  /** Whom and what the token was issued for, invalidating it; null if invalid or expired. */
  consumeToken(token: string) {
    return this.links.consume(token);
  }

  /** An initial password an ADMIN hands over; the hash is the only copy kept. */
  issueInitialPassword(userId: string, passwordHash: string, expiresAt: Date): Promise<void> {
    return this.links.issueInitialPassword(userId, passwordHash, expiresAt);
  }

  /** A link an ADMIN hands over (docs/specs/auth/access-without-mail); replaces the person's previous one. */
  issueAccessLink(userId: string, purpose: LinkPurpose, ttlSeconds: number): Promise<string> {
    return this.issueLink(userId, purpose, ttlSeconds);
  }

  private async issueLink(
    userId: string,
    purpose: LinkPurpose,
    ttlSeconds: number,
  ): Promise<string> {
    const token = await this.links.issue(userId, purpose, ttlSeconds);
    return `${this.webUrl}/set-password?token=${token}`;
  }
}
