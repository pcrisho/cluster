import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Pool } from "pg";
import { withOrg } from "../common/request-context";
import { SystemPrismaService } from "./system-prisma.service";
import { TenantPool } from "./tenant-pool";

const WORKERS = 50;
const OPERATIONS = 2000;

/** Two organizations interleaved over a pool of two connections: no foreign row, no empty result. */
describe("TenantPool under interleaving (real database)", () => {
  const system = new SystemPrismaService();
  const pool = new TenantPool({
    connectionString: process.env.DATABASE_URL!,
    max: 2,
    connectionTimeoutMillis: 60000,
  });
  const app = new PrismaClient({
    adapter: new PrismaPg(pool as unknown as Pool),
  });
  const orgs: { id: string; users: number }[] = [];

  beforeAll(async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    for (const [i, users] of [3, 5].entries()) {
      const slug = `pool-${i}-${stamp}`;
      const org = await system.organization.create({
        data: { name: slug, slug },
      });
      await system.user.createMany({
        data: Array.from({ length: users }, (_, n) => ({
          email: `${slug}-${n}@x.com`,
          passwordHash: "x",
          firstName: "P",
          lastName: String(n),
          organizationId: org.id,
        })),
      });
      orgs.push({ id: org.id, users });
    }
  });

  afterAll(async () => {
    await app.$disconnect();
    await pool.end().catch(() => undefined);
    await system.$disconnect();
  });

  it("never mixes organizations across 2000 plain and transactional operations", async () => {
    const problems: string[] = [];
    let next = 0;
    const check = (
      op: number,
      org: { id: string; users: number },
      rows: { organizationId: string }[],
    ) => {
      if (rows.length !== org.users)
        problems.push(`op ${op}: ${rows.length} rows, expected ${org.users}`);
      if (rows.some((r) => r.organizationId !== org.id))
        problems.push(`op ${op}: foreign row`);
    };
    const worker = async () => {
      for (let op = next++; op < OPERATIONS; op = next++) {
        const org = orgs[op % 2];
        const inTx = (op >> 1) % 2 === 1;
        // Awaited inside withOrg: a Prisma promise is lazy and takes the context where it runs.
        const rows = await withOrg(org.id, async () =>
          inTx
            ? app.$transaction(async (tx) => tx.user.findMany(), {
                maxWait: 60000,
                timeout: 60000,
              })
            : app.user.findMany(),
        );
        check(op, org, rows);
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));
    expect(problems.slice(0, 5)).toEqual([]);
    expect(next).toBeGreaterThanOrEqual(OPERATIONS);
  }, 180000);
});
