import { Pool, type PoolClient, type QueryConfig, type QueryResult } from "pg";
import { getRequestContext } from "../common/request-context";

export class TenantContextMissing extends Error {}

type TenantClient = PoolClient & { orgId?: string };

/**
 * The pool of the ordinary Prisma client. Every connection it hands out carries the request's
 * organization in `app.org_id`, which the row-level security policies read (docs/specs/org/rls).
 * The setting is per connection, not per transaction: one extra round trip only when a connection
 * changes organization.
 */
export class TenantPool extends Pool {
  // The adapter only uses the promise form; the callback form would skip the organization check.
  async connect(cb?: unknown): Promise<PoolClient> {
    if (cb) throw new Error("TenantPool: callback connect is not supported");
    const org = getRequestContext()?.organizationId;
    if (!org)
      throw new TenantContextMissing("No organization in the request context");
    const client: TenantClient = await super.connect();
    if (client.orgId !== org) {
      try {
        await client.query("SELECT set_config('app.org_id', $1, false)", [org]);
        client.orgId = org;
      } catch (e) {
        // Releasing with an error destroys the connection: never reused with a stale organization.
        client.release(e as Error);
        throw e;
      }
    }
    return client;
  }

  // @ts-expect-error pg.Pool.query has callback and stream overloads; the adapter uses only this one.
  async query(
    config: string | QueryConfig,
    values?: unknown[],
  ): Promise<QueryResult> {
    let client: PoolClient;
    try {
      client = await this.connect();
    } catch (e) {
      if (e instanceof TenantContextMissing) {
        const text =
          typeof config === "string"
            ? config
            : (config as { text?: string }).text;
        e.message += `: ${String(text ?? "").slice(0, 200)}`;
      }
      throw e;
    }
    try {
      return await client.query(config, values);
    } finally {
      client.release();
    }
  }
}
