import { Logger } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import Redis from "ioredis";

type Record = Awaited<ReturnType<ThrottlerStorage["increment"]>>;

const PASS: Record = {
  totalHits: 0,
  timeToExpire: 0,
  isBlocked: false,
  timeToBlockExpire: 0,
};
const WARN_EVERY_MS = 60_000;

/**
 * The general rate limit is a ceiling against abuse, not a security wall (the sign-in lockout lives in
 * Postgres): when the shared store cannot answer, requests go through and a warning is logged.
 */
export class FailOpenThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger("Throttler");
  private lastWarning = -Infinity;

  constructor(
    private readonly inner: ThrottlerStorage,
    private readonly now: () => number = Date.now,
  ) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    name: string,
  ): Promise<Record> {
    try {
      return await this.inner.increment(key, ttl, limit, blockDuration, name);
    } catch (err) {
      if (this.now() - this.lastWarning >= WARN_EVERY_MS) {
        this.lastWarning = this.now();
        this.logger.warn(
          `Rate-limit store unavailable, letting requests through: ${(err as Error).message}`,
        );
      }
      return PASS;
    }
  }
}

/**
 * Redis-backed counters shared by every API instance (docs/specs/auth/hardening D-08). Under Jest each
 * test app keeps its own in-memory counters, so suites never see one another's hits.
 */
export function throttlerStorage(
  config: ConfigService,
): ThrottlerStorage | undefined {
  // JEST_WORKER_ID, not NODE_ENV: running Jest through dotenv sets NODE_ENV from .env.
  if (process.env.JEST_WORKER_ID) return undefined;
  const redis = new Redis({
    host: config.get<string>("REDIS_HOST", "localhost"),
    port: Number(config.get<string>("REDIS_PORT", "6379")),
    password: config.get<string>("REDIS_PASSWORD") || undefined,
    // Fail fast instead of queueing commands while Redis is down: the request must not wait.
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });
  redis.on("error", () => undefined); // reported once a minute by FailOpenThrottlerStorage
  return new FailOpenThrottlerStorage(new ThrottlerStorageRedisService(redis));
}
