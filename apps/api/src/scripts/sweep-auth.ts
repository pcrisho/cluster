// Deletes the auth rows nothing needs any more: sessions past their absolute expiry, used or expired challenges and
// links, throttle rows whose window, lock and lock level are over, and auth events older than the retention
// (AUTH_EVENTS_RETENTION_DAYS, default 365). Dry run unless --apply. Runs as the system role (DATABASE_SYSTEM_URL).
//   dev: pnpm --filter @cluster/api auth:sweep [--apply]   server: docker compose exec api node dist/scripts/sweep-auth.js [--apply]
import {
  DEFAULT_EVENTS_RETENTION_DAYS,
  sweepAuth,
} from "../modules/auth/auth-sweep";
import { SystemPrismaService } from "../prisma/system-prisma.service";

async function main() {
  const apply = process.argv.includes("--apply");
  const raw = process.env.AUTH_EVENTS_RETENTION_DAYS;
  const eventsRetentionDays = raw ? Number(raw) : DEFAULT_EVENTS_RETENTION_DAYS;
  if (!Number.isFinite(eventsRetentionDays) || eventsRetentionDays < 1) {
    console.error(`AUTH_EVENTS_RETENTION_DAYS must be 1 or more, got "${raw}"`);
    process.exitCode = 1;
    return;
  }
  const prisma = new SystemPrismaService();
  try {
    const counts = await sweepAuth(prisma, { apply, eventsRetentionDays });
    const tables: Record<keyof typeof counts, string> = {
      sessions: "auth_sessions",
      challenges: "auth_challenges",
      links: "password_links",
      throttle: "login_throttle",
      events: `auth_events (older than ${eventsRetentionDays} days)`,
    };
    for (const [key, table] of Object.entries(tables))
      console.log(`${table}: ${counts[key as keyof typeof counts]}`);
    console.log(
      apply ? "deleted" : "dry run, nothing deleted (pass --apply to delete)",
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
