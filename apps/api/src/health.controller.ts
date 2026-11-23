import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import Redis from "ioredis";
import { Public } from "./common/decorators";
import { SystemPrismaService } from "./prisma/system-prisma.service";
import { StorageService } from "./modules/storage/storage.service";

const CHECK_TIMEOUT_MS = 1000;
const CACHE_MS = 5000;

type Check = "ok" | "down";

/** Redis and storage only report: the API answers 200 while Postgres is up (the rate limit fails open). */
export function summarize(checks: {
  database: Check;
  redis: Check;
  storage: Check;
}) {
  const degraded = checks.redis !== "ok" || checks.storage !== "ok";
  return { status: degraded ? "degraded" : "ok", checks };
}

async function probe(run: () => Promise<unknown>): Promise<Check> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("timeout")),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
    return "ok";
  } catch {
    return "down";
  } finally {
    clearTimeout(timer);
  }
}

/** One short-lived connection per probe round (at most one every CACHE_MS): nothing to keep alive or reconnect. */
async function pingRedis() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || "localhost",
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: CHECK_TIMEOUT_MS,
    retryStrategy: () => null,
  });
  redis.on("error", () => undefined);
  try {
    await redis.connect();
    await redis.ping();
  } finally {
    redis.disconnect();
  }
}

/** Used by the Docker healthcheck (docker-compose.yml) and the external uptime check. */
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly storage: StorageService,
  ) {}

  // Public and unthrottled: one probe round per CACHE_MS however many callers, so it cannot be used to open connections.
  private last?: { at: number; checks: Promise<Check[]> };

  @Public()
  @SkipThrottle()
  @Get()
  async check() {
    if (!this.last || Date.now() - this.last.at > CACHE_MS) {
      this.last = {
        at: Date.now(),
        checks: Promise.all([
          probe(() => this.prisma.$queryRaw`SELECT 1`),
          probe(pingRedis),
          probe(() => this.storage.ping()),
        ]),
      };
    }
    const [database, redis, storage] = await this.last.checks;
    if (database !== "ok") {
      throw new ServiceUnavailableException("Database unavailable");
    }
    return summarize({ database, redis, storage });
  }
}
