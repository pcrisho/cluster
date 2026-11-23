import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type Certificate } from "@prisma/client";
import { audit } from "../../common/audit.helper";
import { bestEffort } from "../../common/best-effort";
import type { AuthenticatedUser } from "../../common/decorators";
import { loadInstanceSettings } from "../../common/instance-settings";
import { accentOf, effectiveSeeds } from "../../common/theme";
import { PrismaService } from "../../prisma/prisma.service";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { StorageService } from "../storage/storage.service";
import { NotificationService } from "../notification/notification.service";
import {
  formatCode,
  newCertificateCode,
  normalizeCode,
} from "./certificate-code";
import { logoForPdf } from "./certificate-logo";
import { renderCertificatePdf } from "./certificate-pdf";
import { todayIn, toDateOnly } from "./due-date";

type Db = Prisma.TransactionClient | PrismaService;

/** Certificates: issued once when a course that issues them is completed, the owner's PDF and public verification. */
@Injectable()
export class CertificatesService {
  private readonly webUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
    private readonly notifications: NotificationService,
    private readonly storage: StorageService,
    config: ConfigService,
  ) {
    this.webUrl = config.get<string>("WEB_URL", "http://localhost:3000");
  }

  /**
   * Issues the certificate of a just-completed enrolment, inside the completion's transaction, with the
   * names as they are now. A second call (or a parallel one) finds it already issued and does nothing.
   */
  async issue(db: Db, courseId: string, userId: string) {
    const course = await db.course.findUniqueOrThrow({
      where: { id: courseId },
      select: {
        title: true,
        issuesCertificate: true,
        organization: { select: { id: true, name: true, timezone: true } },
      },
    });
    if (!course.issuesCertificate) return;
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    });
    const { count } = await db.certificate.createMany({
      data: [
        {
          code: newCertificateCode(),
          organizationId: course.organization.id,
          userId,
          courseId,
          recipientName: `${user.firstName} ${user.lastName}`,
          courseTitle: course.title,
          organizationName: course.organization.name,
          issuedOn: new Date(
            `${todayIn(course.organization.timezone)}T00:00:00Z`,
          ),
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return;
    const cert = await db.certificate.findUniqueOrThrow({
      where: { courseId_userId: { courseId, userId } },
    });
    await audit(db, {
      action: "Certificate.ISSUE",
      actorId: userId,
      organizationId: course.organization.id,
      entityType: "Certificate",
      entityId: cert.id,
      newValues: { code: cert.code, courseId },
    });
    // shortcut: sent before the surrounding transaction commits; a rollback would leave a stray notice (rare: completion is the last write).
    await bestEffort("notify certificate issued", () =>
      this.notifications.notify(userId, {
        type: "grow:certificate:issued",
        title: `Your certificate for ${course.title} is ready`.slice(0, 200),
        link: "/grow/certificates",
        payload: { params: { course: course.title } },
      }),
    );
  }

  async mine(user: AuthenticatedUser) {
    const certs = await this.prisma.certificate.findMany({
      where: { userId: user.id, organizationId: user.orgId },
      orderBy: { issuedAt: "desc" },
    });
    return certs.map(certificateDto);
  }

  /** The owner's certificate as a PDF; anyone else (even in the same organization) gets 404. */
  async pdf(user: AuthenticatedUser, id: string) {
    const cert = await this.prisma.certificate.findFirst({
      where: { id, userId: user.id, organizationId: user.orgId },
    });
    if (!cert) throw new NotFoundException("Certificate not found");
    const code = formatCode(cert.code);
    return {
      file: await renderCertificatePdf(
        cert,
        `${this.webUrl}/verify/${code}`,
        user.locale,
        await this.logoOf(user.orgId),
        await this.accentFor(user.orgId),
      ),
      filename: `certificate-${code}.pdf`,
    };
  }

  /** The brand colour of the organization's certificates: what its people see in the app (instance theme, organization's on top when allowed). */
  private async accentFor(orgId: string) {
    const [settings, org] = await Promise.all([
      loadInstanceSettings(this.prisma),
      this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
    ]);
    return accentOf(effectiveSeeds(settings, org));
  }

  /** The organization's current logo as bytes pdfkit can print; a missing or unreadable file never blocks a download. */
  private async logoOf(orgId: string): Promise<Buffer | null> {
    const org = await this.prisma.organization.findUnique({
      where: { id: orgId },
      select: { logoUrl: true },
    });
    const key = org?.logoUrl;
    if (!key) return null;
    let logo: Buffer | null = null;
    await bestEffort("read the logo for a certificate", async () => {
      const { stream } = await this.storage.getFileStream(key);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk));
      logo = await logoForPdf(Buffer.concat(chunks), key);
    });
    return logo;
  }

  /** Public (no signed-in user, so no organization context): read-only through the system client. Who earned what, from whom and when; nothing else. */
  async verify(input: string) {
    const code = normalizeCode(input);
    const cert = code
      ? await this.system.certificate.findUnique({ where: { code } })
      : null;
    if (!cert) throw new NotFoundException("Certificate not found");
    return {
      recipientName: cert.recipientName,
      courseTitle: cert.courseTitle,
      organizationName: cert.organizationName,
      issuedOn: toDateOnly(cert.issuedOn),
      code: formatCode(cert.code),
    };
  }
}

export function certificateDto(cert: Certificate) {
  return {
    id: cert.id,
    code: formatCode(cert.code),
    courseId: cert.courseId,
    courseTitle: cert.courseTitle,
    recipientName: cert.recipientName,
    organizationName: cert.organizationName,
    issuedOn: toDateOnly(cert.issuedOn),
  };
}
