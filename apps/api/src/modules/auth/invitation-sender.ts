import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { MailService } from "../mail/mail.service";
import { InvitationService } from "./invitation.service";
import { paceIntervalMs, parsePerMinute } from "./invitation-pace";

/**
 * Sends the invitations waiting in the queue (`users.invite_queued_at`), one per interval, so a large import
 * does not hit the provider's per-second limit (docs/specs/auth/access-without-mail). The queue is the column:
 * a restart loses nothing. Runs only when mail is on and the rate is above 0. System client: it crosses organizations.
 */
@Injectable()
export class InvitationSender implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InvitationSender.name);
  private readonly perMinute: number;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly invitations: InvitationService,
    private readonly mail: MailService,
    config: ConfigService,
  ) {
    this.perMinute = parsePerMinute(
      config.get<string>("MAIL_INVITES_PER_MINUTE"),
    );
  }

  onModuleInit() {
    if (!this.mail.enabled || this.perMinute === 0) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) =>
        this.logger.error("Invitation queue tick failed", err),
      );
    }, paceIntervalMs(this.perMinute));
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Sends the oldest queued invitation, if any. A failed send is logged and still clears the mark (the ADMIN can resend). */
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const next = await this.prisma.user.findFirst({
        where: { inviteQueuedAt: { not: null } },
        orderBy: { inviteQueuedAt: "asc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          isActive: true,
          passwordSetAt: true,
          organization: { select: { name: true, isActive: true } },
        },
      });
      if (!next) return;
      try {
        // Someone who set a password, was deactivated or whose organization was suspended meanwhile gets no invitation;
        // their mark still clears.
        if (
          next.passwordSetAt === null &&
          next.isActive &&
          next.organization.isActive
        ) {
          await this.invitations.sendInvite(next, next.organization.name);
        }
      } catch (err) {
        this.logger.error(`Queued invitation to user ${next.id} failed`, err);
      } finally {
        await this.prisma.user.update({
          where: { id: next.id },
          data: { inviteQueuedAt: null },
        });
      }
    } finally {
      this.busy = false;
    }
  }
}
