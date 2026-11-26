import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { audit } from "../../common/audit.helper";
import type { ActorContext } from "../../common/decorators";
import { loadInstanceSettings } from "../../common/instance-settings";
import { effectiveLocale } from "../../common/locale";
import { translate } from "../../i18n/translate";
import { InvitationService } from "../auth/invitation.service";
import { isValidLifetime, lifetimeSeconds } from "../auth/access-lifetimes";
import { generateInitialPassword } from "../auth/initial-password";
import { hashPassword } from "../auth/password-hash";
import { accessWorkbook, formatExpiry, joinNodePath } from "./access-export";
import { subtreeMemberIds } from "./org-subtree";
import type { ExportAccessDto } from "./dto/access-export.dto";

/** One password is one bcrypt hash; more people than this would hold the request for minutes. */
export const MAX_PASSWORD_EXPORT = 500;
/** Hashes and writes run this many at a time: a bounded share of the hashing pool. */
const CHUNK = 8;

export interface AccessExport {
  file: Buffer;
  /** Active members of the subtree, who already set a password and are not in the file. */
  skipped: number;
}

/**
 * The credentials file of an ADMIN (docs/specs/auth/access-without-mail): every pending member of a node's
 * subtree gets a fresh link or initial password, written once into the workbook. Active members are counted and skipped.
 */
@Injectable()
export class AccessExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationService,
  ) {}

  async export(
    actor: ActorContext,
    dto: ExportAccessDto,
  ): Promise<AccessExport> {
    if (!isValidLifetime("INVITE", dto.lifetime)) {
      throw new BadRequestException({
        code: "INVALID_LIFETIME",
        message: "That lifetime is not offered",
      });
    }
    const memberIds = await subtreeMemberIds(
      this.prisma,
      actor.orgId,
      dto.nodeId,
    );
    if (memberIds === null) throw new NotFoundException("Node not found");

    const people = await this.prisma.user.findMany({
      where: {
        id: { in: memberIds },
        organizationId: actor.orgId,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        orgColaboratorId: true,
        passwordSetAt: true,
        profile: { select: { orgNodeId: true } },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    });
    const pending = people.filter((p) => p.passwordSetAt === null);
    // Nobody to give access to: no file (it would hold only the header) and no audit entry.
    if (pending.length === 0) {
      throw new ConflictException({
        code: "EXPORT_EMPTY",
        message: "Nobody in this area is waiting for access",
        params: { skipped: people.length },
      });
    }
    if (dto.kind === "password" && pending.length > MAX_PASSWORD_EXPORT) {
      throw new BadRequestException({
        code: "EXPORT_TOO_LARGE",
        message: `A password file holds at most ${MAX_PASSWORD_EXPORT} people`,
        params: { max: MAX_PASSWORD_EXPORT },
      });
    }

    const ttl = lifetimeSeconds(dto.lifetime);
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const credentials = new Map<string, string>();
    for (let i = 0; i < pending.length; i += CHUNK) {
      await Promise.all(
        pending
          .slice(i, i + CHUNK)
          .map(async (p) =>
            credentials.set(
              p.id,
              await this.issue(p.id, dto.kind, ttl, expiresAt),
            ),
          ),
      );
    }

    const [locale, timeZone, nameOf, parentOf] = await this.context(actor);
    const expires = formatExpiry(expiresAt, locale, timeZone);
    const pathOf = (nodeId: string | null | undefined) => {
      const names: string[] = [];
      for (
        let id = nodeId ?? null;
        id && nameOf.has(id);
        id = parentOf.get(id) ?? null
      )
        names.unshift(nameOf.get(id)!);
      return joinNodePath(names);
    };
    const headers = [
      translate(locale, "exportAccess.headers.firstName"),
      translate(locale, "exportAccess.headers.lastName"),
      translate(locale, "exportAccess.headers.email"),
      translate(locale, "exportAccess.headers.path"),
      translate(locale, "exportAccess.headers.employeeCode"),
      translate(locale, "exportAccess.headers.credential"),
      translate(locale, "exportAccess.headers.expiresAt"),
    ];
    const file = await accessWorkbook({
      notice: translate(locale, "exportAccess.notice"),
      sheet: translate(locale, "exportAccess.sheet"),
      headers,
      rows: pending.map((p) => [
        p.firstName,
        p.lastName,
        p.email,
        pathOf(p.profile?.orgNodeId),
        p.orgColaboratorId ?? "",
        credentials.get(p.id) ?? "",
        expires,
      ]),
    });

    await audit(this.prisma, {
      action: "Organization.EXPORT_ACCESS",
      actorId: actor.userId,
      organizationId: actor.orgId,
      entityType: "Organization",
      entityId: actor.orgId,
      newValues: {
        nodeId: dto.nodeId,
        kind: dto.kind,
        lifetime: dto.lifetime,
        count: pending.length,
      },
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
    });
    return { file, skipped: people.length - pending.length };
  }

  /** A fresh credential for one person; it replaces whatever they had. Returns the link or the password. */
  private async issue(
    userId: string,
    kind: "link" | "password",
    ttl: number,
    expiresAt: Date,
  ): Promise<string> {
    if (kind === "link")
      return this.invitations.issueAccessLink(userId, "INVITE", ttl);
    const password = generateInitialPassword();
    await this.invitations.issueInitialPassword(
      userId,
      await hashPassword(password),
      expiresAt,
    );
    return password;
  }

  /** The ADMIN's language (the file's text), the organization's time zone (the dates) and its nodes (the paths). */
  private async context(actor: ActorContext) {
    const [user, settings, nodes] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({
        where: { id: actor.userId },
        select: {
          locale: true,
          organization: { select: { locale: true, timezone: true } },
        },
      }),
      loadInstanceSettings(this.prisma),
      this.prisma.orgNode.findMany({
        where: { organizationId: actor.orgId },
        select: { id: true, name: true, parentId: true },
      }),
    ]);
    const locale = effectiveLocale(
      user.locale,
      user.organization.locale,
      settings.defaultLocale,
    );
    return [
      locale,
      user.organization.timezone,
      new Map(nodes.map((n) => [n.id, n.name] as const)),
      new Map(nodes.map((n) => [n.id, n.parentId] as const)),
    ] as const;
  }
}
