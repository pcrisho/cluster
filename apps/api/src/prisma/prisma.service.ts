import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common"
import { PrismaClient } from "@prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"
import type { Pool } from "pg"
import { TenantPool } from "./tenant-pool"

const fromEnv = (name: string, fallback: number) => Number(process.env[name]) || fallback

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaPg(
      // TenantPool narrows query() to the promise form (see there), so TypeScript needs the cast.
      new TenantPool({
        connectionString: process.env.DATABASE_URL!,
        max: fromEnv("DB_POOL_MAX", 10),
        connectionTimeoutMillis: fromEnv("DB_CONNECTION_TIMEOUT_MS", 5000),
        statement_timeout: fromEnv("DB_STATEMENT_TIMEOUT_MS", 30000),
        idle_in_transaction_session_timeout: fromEnv("DB_IDLE_IN_TX_TIMEOUT_MS", 60000),
      }) as unknown as Pool,
      // The adapter leaves a pool it did not create open on $disconnect unless told otherwise.
      { disposeExternalPool: true },
    )
    // ydoc is an opaque, possibly multi-MB buffer: load it only with `omit: { ydoc: false }`.
    super({ adapter, omit: { page: { ydoc: true }, space: { ydoc: true } } })
  }

  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
