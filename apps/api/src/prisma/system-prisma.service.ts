import { Injectable, OnModuleDestroy } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

/**
 * The system role (cluster_system): bypasses row-level security, DML only, owns nothing. Only for paths
 * with no organization yet or that cross organizations on purpose (docs/specs/org/rls, rule 2); ESLint
 * limits who may import it. Never the owner: that one stays out of the API process.
 */
@Injectable()
export class SystemPrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_SYSTEM_URL
    if (!connectionString) throw new Error("DATABASE_SYSTEM_URL is required (the cluster_system role's URL, see .env.example)")
    const adapter = new PrismaPg({ connectionString })
    super({ adapter, omit: { page: { ydoc: true }, space: { ydoc: true } } })
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
