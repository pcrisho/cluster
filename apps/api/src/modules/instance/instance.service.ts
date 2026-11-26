import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { parseGlass } from "@cluster/theme";
import { verifyPassword } from "../auth/password-hash";
import { SystemPrismaService } from "../../prisma/system-prisma.service";
import { loadInstanceSettings } from "../../common/instance-settings";
import { audit, diff } from "../../common/audit.helper";
import type { ActorContext } from "../../common/decorators";
import { seedsOf, themeData } from "../../common/theme";
import { AuthService } from "../auth/auth.service";
import { InvitationService } from "../auth/invitation.service";
import {
  CreateOrganizationDto,
  UpdateInstanceSettingsDto,
  UpdateOrganizationStatusDto,
} from "./dto/instance.dto";
import { MailService } from "../mail/mail.service";

/** God mode: settings of the whole installation and its organizations (tenants). Uses the system client throughout: it crosses organizations and the bootstrap has no request. */
@Injectable()
export class InstanceService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InstanceService.name);

  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly auth: AuthService,
    private readonly invitations: InvitationService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  /**
   * First boot of a fresh instance: if SUPERADMIN_EMAIL/SUPERADMIN_PASSWORD are
   * set and no superadmin exists yet, create one (promoting the user if the
   * email already exists). Never touches an instance that has a superadmin.
   */
  async onApplicationBootstrap() {
    await loadInstanceSettings(this.prisma);

    const email = this.config.get<string>("SUPERADMIN_EMAIL");
    const password = this.config.get<string>("SUPERADMIN_PASSWORD");
    if (!email || !password) return;
    if (await this.prisma.user.findFirst({ where: { isSuperAdmin: true } }))
      return;

    const existing = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
    if (existing) {
      // Anyone could have registered this email (public sign-up, an invitation) before the
      // operator configured it. Promote only an account whose password is SUPERADMIN_PASSWORD,
      // which proves the operator controls it.
      if (!(await verifyPassword(password, existing.passwordHash))) {
        this.logger.error(
          `SUPERADMIN_EMAIL ${existing.email} belongs to an existing account whose password is not ` +
            `SUPERADMIN_PASSWORD; it was not promoted. Use another email or set that account's password.`,
        );
        return;
      }
      await this.prisma.user.update({
        where: { id: existing.id },
        data: { isSuperAdmin: true },
      });
      this.logger.log(`Promoted ${existing.email} to instance superadmin`);
      return;
    }

    const { user } = await this.auth.provisionOrganization({
      name: this.config.get<string>("SUPERADMIN_ORG_NAME", "Default"),
      admin: { email, firstName: "Instance", lastName: "Admin", password },
    });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { isSuperAdmin: true },
    });
    this.logger.log(`Created instance superadmin ${user.email}`);
  }

  /** Safe subset for unauthenticated visitors (register / login pages). */
  async getPublicSettings() {
    const settings = await loadInstanceSettings(this.prisma);
    const { name, registrationOpen, defaultLocale } = settings;
    return {
      name,
      registrationOpen,
      defaultLocale,
      theme: { ...seedsOf(settings), glassKey: parseGlass(settings.glassKey) },
      // Signed-out pages use it to explain flows that need e-mail (docs/specs/auth/access-without-mail).
      mailEnabled: this.mail.enabled,
    };
  }

  getSettings() {
    return loadInstanceSettings(this.prisma);
  }

  async updateSettings(
    actor: ActorContext,
    { theme, ...dto }: UpdateInstanceSettingsDto,
  ) {
    const stored = await loadInstanceSettings(this.prisma);
    const seeds = theme ? themeData(theme, seedsOf(stored)) : {};
    // The glass level is not a seed (instance only), so it is written beside them, never through themeData.
    const columns =
      theme?.glassKey === undefined
        ? seeds
        : { ...seeds, glassKey: theme.glassKey };
    // Diff against the stored columns, not the parsed seeds, so clearing a stored orphan shows in the audit.
    const { oldValues, newValues } = diff(stored, columns);
    if (dto.nodeIsolationAllowed === false) {
      // Turning isolation off would silently expose every isolated organization's clients to each other.
      const organizations = await this.prisma.organization.findMany({
        where: { isolateRootNodes: true },
        select: { id: true, name: true },
        orderBy: { createdAt: "asc" },
      });
      if (organizations.length > 0) {
        throw new ConflictException({
          code: "ISOLATION_IN_USE",
          message: "Organizations still isolate their main nodes",
          organizations,
        });
      }
    }
    // Organizations keep their enabledModules; the effective set is intersected at read time.
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.instanceSettings.update({
        where: { id: 1 },
        data: { ...dto, ...columns },
      });
      if (
        dto.orgThemingAllowed !== undefined &&
        dto.orgThemingAllowed !== stored.orgThemingAllowed
      ) {
        await audit(tx, {
          action: "InstanceSettings.SET_ORG_THEMING",
          actorId: actor.userId,
          organizationId: null,
          entityType: "InstanceSettings",
          entityId: "1",
          oldValues: { orgThemingAllowed: stored.orgThemingAllowed },
          newValues: { orgThemingAllowed: dto.orgThemingAllowed },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }
      if (
        dto.nodeIsolationAllowed !== undefined &&
        dto.nodeIsolationAllowed !== stored.nodeIsolationAllowed
      ) {
        await audit(tx, {
          action: "InstanceSettings.SET_NODE_ISOLATION",
          actorId: actor.userId,
          organizationId: null,
          entityType: "InstanceSettings",
          entityId: "1",
          oldValues: { nodeIsolationAllowed: stored.nodeIsolationAllowed },
          newValues: { nodeIsolationAllowed: dto.nodeIsolationAllowed },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }
      if (
        dto.passwordBreachCheck !== undefined &&
        dto.passwordBreachCheck !== stored.passwordBreachCheck
      ) {
        await audit(tx, {
          action: "InstanceSettings.SET_BREACH_CHECK",
          actorId: actor.userId,
          organizationId: null,
          entityType: "InstanceSettings",
          entityId: "1",
          oldValues: { passwordBreachCheck: stored.passwordBreachCheck },
          newValues: { passwordBreachCheck: dto.passwordBreachCheck },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }
      if (Object.keys(newValues).length > 0) {
        await audit(tx, {
          action: "InstanceSettings.UPDATE_THEME",
          actorId: actor.userId,
          organizationId: null,
          entityType: "InstanceSettings",
          entityId: "1",
          oldValues,
          newValues,
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }
      return updated;
    });
  }

  async listOrganizations() {
    const orgs = await this.prisma.organization.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        themingEnabled: true,
        isolateRootNodes: true,
        enabledModules: true,
        createdAt: true,
        _count: { select: { users: true } },
      },
    });
    return orgs.map(({ _count, ...org }) => ({
      ...org,
      memberCount: _count.users,
    }));
  }

  /** Creates a tenant with its first ADMIN, who receives an invitation email. */
  async createOrganization(dto: CreateOrganizationDto) {
    const { organization, user } = await this.auth.provisionOrganization({
      name: dto.name,
      timezone: dto.timezone,
      admin: dto.admin,
    });
    let inviteSent = false;
    try {
      // False with mail off: the operator gives the ADMIN a link with `auth:access-link` (access-without-mail).
      inviteSent = await this.invitations.sendInvite(user, organization.name);
    } catch (err) {
      this.logger.error(`Failed to send invitation to user ${user.id}`, err);
    }
    return {
      organization,
      admin: user,
      inviteSent,
      mailEnabled: this.mail.enabled,
    };
  }

  async updateOrganization(
    id: string,
    actor: ActorContext,
    dto: UpdateOrganizationStatusDto,
  ) {
    if (dto.isActive === false && id === actor.orgId) {
      throw new BadRequestException({
        code: "OWN_ORG_SUSPEND",
        message: "You cannot suspend your own organization",
      });
    }
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException("Organization not found");
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.organization.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
          ...(dto.themingEnabled !== undefined && {
            themingEnabled: dto.themingEnabled,
          }),
        },
      });
      if (
        dto.themingEnabled !== undefined &&
        dto.themingEnabled !== org.themingEnabled
      ) {
        await audit(tx, {
          action: "Organization.SET_THEMING",
          actorId: actor.userId,
          organizationId: id, // the target organization, so it shows in its own Activity
          entityType: "Organization",
          entityId: id,
          oldValues: { themingEnabled: org.themingEnabled },
          newValues: { themingEnabled: dto.themingEnabled },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        });
      }
      return updated;
    });
  }
}
