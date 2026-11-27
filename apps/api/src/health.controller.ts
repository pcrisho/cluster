import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "./common/decorators";
import {
  type CheckStatus,
  pingRedis,
  probe,
  summarize,
} from "./common/health-probes";
import { SystemPrismaService } from "./prisma/system-prisma.service";
import { StorageService } from "./modules/storage/storage.service";

export { summarize };

const CACHE_MS = 5000;

/** Used by the Docker healthcheck (docker-compose.yml) and the external uptime check. */
@Controller("health")
export class HealthController {
  constructor(
    private readonly prisma: SystemPrismaService,
    private readonly storage: StorageService,
  ) {}

  // Public and unthrottled: one probe round per CACHE_MS however many callers, so it cannot be used to open connections.
  private last?: { at: number; checks: Promise<CheckStatus[]> };

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
