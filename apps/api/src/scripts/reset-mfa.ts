// Turns off a person's 2FA when no tenant ADMIN can: the superadmin, or the only ADMIN who lost their device
// and recovery codes (docs/specs/auth/hardening R-20). Runs as the system role (DATABASE_SYSTEM_URL); leaves an auth event.
//   dev: pnpm --filter @cluster/api auth:reset-mfa <email>   server: docker compose exec api node dist/scripts/reset-mfa.js <email>
// shortcut: sessions are revoked in the database only, so an open socket lasts until its token expires (≤15 min).
import { SystemPrismaService } from "../prisma/system-prisma.service";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: pnpm --filter @cluster/api auth:reset-mfa <email>");
    process.exitCode = 1;
    return;
  }
  const prisma = new SystemPrismaService();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      console.error(`No account for ${email}`);
      process.exitCode = 1;
      return;
    }
    await prisma.$transaction([
      prisma.mfaRecoveryCode.deleteMany({ where: { userId: user.id } }),
      prisma.userMfa.deleteMany({ where: { userId: user.id } }),
      prisma.authSession.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "MFA_CHANGED" },
      }),
      prisma.authEvent.create({
        data: {
          type: "MFA_RESET",
          userId: user.id,
          detail: { by: "operator" },
        },
      }),
    ]);
    console.log(
      `2FA reset for ${email}; every session ended. A role that requires 2FA enrolls again at sign-in.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
