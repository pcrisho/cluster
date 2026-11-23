import { MailService } from "../mail/mail.service";
import { ConfigService } from "@nestjs/config";
import { hashPassword } from "../auth/password-hash";
import { InstanceService } from "./instance.service";
import type { SystemPrismaService } from "../../prisma/system-prisma.service";
import type { AuthService } from "../auth/auth.service";
import type { InvitationService } from "../auth/invitation.service";

describe("InstanceService.onApplicationBootstrap (first superadmin)", () => {
  function setup(
    env: Record<string, string>,
    db: { superAdmin?: object; userByEmail?: object },
  ) {
    const prisma = {
      instanceSettings: { findUnique: jest.fn().mockResolvedValue({ id: 1 }) },
      user: {
        findFirst: jest.fn().mockResolvedValue(db.superAdmin ?? null),
        findUnique: jest.fn().mockResolvedValue(db.userByEmail ?? null),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const auth = {
      provisionOrganization: jest
        .fn()
        .mockResolvedValue({
          organization: { id: "org-new" },
          user: { id: "u-new", email: "root@x.com" },
        }),
    };
    const service = new InstanceService(
      prisma as unknown as SystemPrismaService,
      auth as unknown as AuthService,
      {} as InvitationService,
      {
        get: (key: string, fallback?: string) => env[key] ?? fallback,
      } as unknown as ConfigService,
      { enabled: true } as unknown as MailService,
    );
    return { service, prisma, auth };
  }

  const env = {
    SUPERADMIN_EMAIL: "Root@X.com",
    SUPERADMIN_PASSWORD: "Root1234",
  };

  it("does nothing without SUPERADMIN_* env vars", async () => {
    const { service, auth, prisma } = setup({}, {});
    await service.onApplicationBootstrap();
    expect(auth.provisionOrganization).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("never touches an instance that already has a superadmin", async () => {
    const { service, auth, prisma } = setup(env, {
      superAdmin: { id: "existing" },
    });
    await service.onApplicationBootstrap();
    expect(auth.provisionOrganization).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("promotes an existing user with that email only if SUPERADMIN_PASSWORD is their password", async () => {
    const passwordHash = await hashPassword("Root1234", 4);
    const { service, auth, prisma } = setup(env, {
      userByEmail: { id: "u1", email: "root@x.com", passwordHash },
    });
    await service.onApplicationBootstrap();
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "root@x.com" },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { isSuperAdmin: true },
    });
    expect(auth.provisionOrganization).not.toHaveBeenCalled();
  });

  it("never promotes an account someone else registered with that email", async () => {
    // e.g. signed up while registration was open, before the operator set SUPERADMIN_EMAIL
    const passwordHash = await hashPassword("Attacker1234", 4);
    const { service, auth, prisma } = setup(env, {
      userByEmail: { id: "u1", email: "root@x.com", passwordHash },
    });
    await service.onApplicationBootstrap();
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(auth.provisionOrganization).not.toHaveBeenCalled();
  });

  it("otherwise creates an organization and the superadmin", async () => {
    const { service, auth, prisma } = setup(
      { ...env, SUPERADMIN_ORG_NAME: "Acme" },
      {},
    );
    await service.onApplicationBootstrap();
    expect(auth.provisionOrganization).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Acme",
        admin: expect.objectContaining({ password: "Root1234" }),
      }),
    );
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u-new" },
      data: { isSuperAdmin: true },
    });
  });
});
