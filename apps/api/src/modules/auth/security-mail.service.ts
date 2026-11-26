import { Injectable } from "@nestjs/common";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { loadInstanceSettings } from "../../common/instance-settings";
import { effectiveLocale } from "../../common/locale";
import { bestEffort } from "../../common/best-effort";
import { translate } from "../../i18n/translate";
import { MailService } from "../mail/mail.service";
import type { ClientMeta } from "./auth.service";

export type SecurityNotice =
  | "passwordChanged"
  | "passwordReset"
  | "emailChanged"
  | "mfaEnabled"
  | "mfaDisabled"
  | "mfaChanged"
  | "recoveryCodeUsed"
  | "accessLinkCreated";

/**
 * Tells a person their credentials changed (docs/specs/auth/hardening R-31): what, when (in their
 * organization's time zone) and from which address, in their language, with no link to act on. Best
 * effort: a mail failure is logged and never fails the change. System client: it may run before any
 * organization context (a password reset, a sign-in step).
 */
@Injectable()
export class SecurityMailService {
  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly mail: MailService,
  ) {}

  /** `to` overrides the person's current address (an e-mail change warns the old one). */
  notify(userId: string, notice: SecurityNotice, client: ClientMeta, to?: string) {
    return bestEffort(`security notice ${notice} to user ${userId}`, () =>
      this.send(userId, notice, client, to),
    );
  }

  private async send(
    userId: string,
    notice: SecurityNotice,
    client: ClientMeta,
    to?: string,
  ) {
    const [user, settings] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          email: true,
          firstName: true,
          locale: true,
          organization: { select: { locale: true, timezone: true } },
        },
      }),
      loadInstanceSettings(this.prisma),
    ]);
    const locale = effectiveLocale(
      user.locale,
      user.organization.locale,
      settings.defaultLocale,
    );
    const params = {
      name: user.firstName,
      what: translate(locale, `security.${notice}.what`),
      when: new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "long", // carries the zone; timeZoneName cannot be combined with the styles
        timeZone: user.organization.timezone,
      }).format(new Date()),
      ip: client.ipAddress ?? translate(locale, "security.unknownAddress"),
    };
    await this.mail.send({
      to: to ?? user.email,
      subject: translate(locale, `security.${notice}.subject`),
      text: translate(locale, "security.text", params),
      html: translate(locale, "security.html", params, { html: true }),
    });
  }
}
