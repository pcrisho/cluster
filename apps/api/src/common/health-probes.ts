import Redis from "ioredis";

export const CHECK_TIMEOUT_MS = 1000;

export type CheckStatus = "ok" | "down";
export type OptionalCheckStatus = CheckStatus | "unconfigured";

export interface CollabProbeResult {
  status: OptionalCheckStatus;
  documents?: number;
  connections?: number;
  uptimeSeconds?: number;
}

/** Public health summary: Redis and storage only report degraded; Postgres controls 503. */
export function summarize(checks: {
  database: CheckStatus;
  redis: CheckStatus;
  storage: CheckStatus;
}) {
  const degraded = checks.redis !== "ok" || checks.storage !== "ok";
  return { status: degraded ? "degraded" : "ok", checks };
}

/** Superadmin system-status summary including the optional collab service. */
export function summarizeSystemStatus(checks: {
  database: CheckStatus;
  redis: CheckStatus;
  storage: CheckStatus;
  collab: OptionalCheckStatus;
}): "ok" | "degraded" | "down" {
  if (checks.database === "down") return "down";
  if (
    checks.redis === "down" ||
    checks.storage === "down" ||
    checks.collab === "down"
  ) {
    return "degraded";
  }
  return "ok";
}

export async function probe(run: () => Promise<unknown>): Promise<CheckStatus> {
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

/** One short-lived connection per probe round: nothing to keep alive or reconnect. */
export async function pingRedis() {
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

/** Checks the realtime collab service `/health` endpoint when COLLAB_URL is set. */
export async function pingCollab(
  collabUrl: string | undefined,
): Promise<CollabProbeResult> {
  const trimmed = collabUrl?.trim();
  if (!trimmed) return { status: "unconfigured" };
  try {
    const base = trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
    const res = await fetch(`${base}/health`, {
      signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
    });
    if (!res.ok) return { status: "down" };
    const body = (await res.json()) as {
      documents?: unknown;
      connections?: unknown;
      uptime?: unknown;
    };
    return {
      status: "ok",
      documents: typeof body.documents === "number" ? body.documents : undefined,
      connections:
        typeof body.connections === "number" ? body.connections : undefined,
      uptimeSeconds: typeof body.uptime === "number" ? body.uptime : undefined,
    };
  } catch {
    return { status: "down" };
  }
}
