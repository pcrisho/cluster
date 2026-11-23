import { Injectable, Logger } from "@nestjs/common"
import { ConfigService } from "@nestjs/config"
import { createTransport, type Transporter } from "nodemailer"

export interface MailMessage {
  to: string
  subject: string
  html: string
  text: string
}

/**
 * Plain SMTP so the provider is configuration only:
 * Mailpit in dev/tests (localhost:1025), Resend in production (smtp.resend.com:465).
 * Mail is on only when SMTP_HOST is set (docs/specs/auth/access-without-mail): with it empty nothing is
 * sent, and every skipped message is logged once.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name)
  private readonly transport: Transporter | null
  private readonly from: string

  constructor(config: ConfigService) {
    const host = config.get<string>("SMTP_HOST", "")
    const user = config.get<string>("SMTP_USER")
    this.transport = host
      ? createTransport({
          host,
          port: Number(config.get<string>("SMTP_PORT", "1025")),
          secure: config.get<string>("SMTP_SECURE") === "true",
          auth: user ? { user, pass: config.get<string>("SMTP_PASS", "") } : undefined,
        })
      : null
    this.from = config.get<string>("MAIL_FROM", "Cluster <no-reply@cluster.local>")
  }

  /** Whether this instance sends e-mail at all. Flows that need it check this before they issue anything. */
  get enabled(): boolean {
    return this.transport !== null
  }

  async send(message: MailMessage): Promise<void> {
    if (!this.transport) {
      this.logger.log(`Mail "${message.subject}" not sent to ${message.to}: mail is off (SMTP_HOST is empty)`)
      return
    }
    await this.transport.sendMail({ from: this.from, ...message })
    this.logger.log(`Mail "${message.subject}" sent to ${message.to}`)
  }
}
