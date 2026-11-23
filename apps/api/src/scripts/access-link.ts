// Prints an access link for any account when no ADMIN of its organization can issue one and mail is off: the first
// ADMIN of an organization the superadmin just created, or the superadmin themself (docs/specs/auth/access-without-mail).
// A pending account gets an INVITE link, an active one a RESET link (2FA still applies). Replaces the person's previous
// link or initial password. Runs as the system role (DATABASE_SYSTEM_URL); leaves an auth event, never the link.
//   dev: pnpm --filter @cluster/api auth:access-link <email> [--hours N]
//   server: docker compose exec api node dist/scripts/access-link.js <email> [--hours N]
import { SystemPrismaService } from "../prisma/system-prisma.service";
import { PasswordLinksService } from "../modules/auth/password-links.service";
import {
  DEFAULT_LIFETIME_HOURS,
  isValidLifetime,
  LIFETIME_PRESETS,
  lifetimeSeconds,
  type AccessPurpose,
} from "../modules/auth/access-lifetimes";

const USAGE = "Usage: auth:access-link <email> [--hours N]";

async function main() {
  const args = process.argv.slice(2);
  const email = args
    .find((a) => !a.startsWith("--"))
    ?.trim()
    .toLowerCase();
  const hoursAt = args.indexOf("--hours");
  if (!email || (hoursAt >= 0 && !args[hoursAt + 1])) {
    console.error(USAGE);
    process.exitCode = 1;
    return;
  }
  const prisma = new SystemPrismaService();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        isActive: true,
        passwordSetAt: true,
        organization: { select: { isActive: true } },
      },
    });
    if (!user) {
      console.error(`No account for ${email}`);
      process.exitCode = 1;
      return;
    }
    if (!user.isActive || !user.organization.isActive) {
      console.error(
        `${email} is deactivated or their organization is suspended`,
      );
      process.exitCode = 1;
      return;
    }
    const purpose: AccessPurpose =
      user.passwordSetAt === null ? "INVITE" : "RESET";
    const hours =
      hoursAt >= 0
        ? Number(args[hoursAt + 1])
        : DEFAULT_LIFETIME_HOURS[purpose];
    if (!isValidLifetime(purpose, hours)) {
      console.error(
        `--hours for ${purpose} must be one of ${LIFETIME_PRESETS[purpose].join(", ")}`,
      );
      process.exitCode = 1;
      return;
    }
    const token = await new PasswordLinksService(prisma).issue(
      user.id,
      purpose,
      lifetimeSeconds(hours),
    );
    await prisma.authEvent.create({
      data: {
        type: "ACCESS_LINK_ISSUED",
        userId: user.id,
        detail: { by: "operator", purpose, hours },
      },
    });
    const webUrl = process.env.WEB_URL || "http://localhost:3000";
    console.log(
      `${purpose} link for ${email}, valid ${hours} h. It works once; give it to the person only:`,
    );
    console.log(`${webUrl}/set-password?token=${token}`);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
