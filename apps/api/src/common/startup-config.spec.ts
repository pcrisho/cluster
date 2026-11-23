import { checkStartupConfig } from "./startup-config";

const SAFE = {
  JWT_SECRET: "a".repeat(64),
  STORAGE_ACCESS_KEY: "storage-user",
  STORAGE_SECRET_KEY: "s".repeat(40),
  WEB_URL: "https://cluster.example.com",
  REDIS_PASSWORD: "r".repeat(32),
  AUTH_SECRET_KEY: "k".repeat(64),
  COLLAB_INTERNAL_SECRET: "c".repeat(64),
  DATABASE_URL: "postgresql://cluster_app:7f3a9c1e5b2d4f6a8c0e@db:5432/cluster",
  DATABASE_SYSTEM_URL:
    "postgresql://cluster_system:5c8e0a2b4d6f8135792b@db:5432/cluster",
  DATABASE_OWNER_URL:
    "postgresql://cluster:2b9d4e6f8a1c3e5b7d9f@db:5432/cluster",
};

describe("checkStartupConfig", () => {
  it("accepts a production-grade configuration", () => {
    expect(checkStartupConfig(SAFE)).toEqual({ errors: [], warnings: [] });
  });

  it.each([
    ["missing", undefined],
    ["the .env.example default", "change-me-in-production"],
    ["too short", "short-secret"],
  ])("rejects a JWT_SECRET that is %s", (_, value) => {
    const { errors } = checkStartupConfig({ ...SAFE, JWT_SECRET: value });
    expect(errors).toEqual([expect.stringContaining("JWT_SECRET")]);
  });

  it.each([
    ["missing", undefined],
    ["too short", "short-key"],
    ["the same as JWT_SECRET", "a".repeat(64)],
  ])("rejects an AUTH_SECRET_KEY that is %s", (_, value) => {
    const { errors } = checkStartupConfig({ ...SAFE, AUTH_SECRET_KEY: value });
    expect(errors).toEqual([expect.stringContaining("AUTH_SECRET_KEY")]);
  });

  it.each([
    ["missing", undefined],
    ["too short", "short-collab-secret"],
    ["the same as JWT_SECRET", "a".repeat(64)],
    ["the same as AUTH_SECRET_KEY", "k".repeat(64)],
  ])("rejects a COLLAB_INTERNAL_SECRET that is %s", (_, value) => {
    const { errors } = checkStartupConfig({
      ...SAFE,
      COLLAB_INTERNAL_SECRET: value,
    });
    expect(errors).toEqual([expect.stringContaining("COLLAB_INTERNAL_SECRET")]);
  });

  it.each([
    ["DATABASE_URL", "cluster_app"],
    ["DATABASE_SYSTEM_URL", "cluster_system"],
    ["DATABASE_OWNER_URL", "cluster"],
  ])("rejects the default password in %s", (key, password) => {
    const { errors } = checkStartupConfig({
      ...SAFE,
      [key]: `postgresql://user:${password}@db:5432/cluster`,
    });
    expect(errors).toEqual([expect.stringContaining(key)]);
  });

  it("compares the decoded database password with the defaults", () => {
    const { errors } = checkStartupConfig({
      ...SAFE,
      DATABASE_OWNER_URL: "postgresql://cluster:clu%73ter@db:5432/cluster",
    });
    expect(errors).toEqual([expect.stringContaining("DATABASE_OWNER_URL")]);
  });

  it("leaves a missing database URL to the database client", () => {
    expect(
      checkStartupConfig({ ...SAFE, DATABASE_URL: undefined }).errors,
    ).toEqual([]);
  });

  it("rejects missing or default storage credentials", () => {
    const { errors } = checkStartupConfig({
      ...SAFE,
      // The default of older .env files.
      STORAGE_ACCESS_KEY: "minioadmin",
      STORAGE_SECRET_KEY: undefined,
    });
    expect(errors).toEqual([
      expect.stringContaining("STORAGE_ACCESS_KEY"),
      expect.stringContaining("STORAGE_SECRET_KEY"),
    ]);
  });

  it("only warns about plain-http WEB_URL and a Redis without password", () => {
    const report = checkStartupConfig({
      ...SAFE,
      WEB_URL: "http://intranet",
      REDIS_PASSWORD: "",
    });
    expect(report.errors).toEqual([]);
    expect(report.warnings).toHaveLength(2);
  });

  it("flags the .env.example configuration", () => {
    const report = checkStartupConfig({
      JWT_SECRET: "change-me-in-production",
      STORAGE_ACCESS_KEY: "cluster-storage",
      STORAGE_SECRET_KEY: "cluster-storage-secret",
      WEB_URL: "http://localhost:3000",
      DATABASE_URL:
        "postgresql://cluster_app:cluster_app@localhost:5432/cluster",
      DATABASE_SYSTEM_URL:
        "postgresql://cluster_system:cluster_system@localhost:5432/cluster",
      DATABASE_OWNER_URL: "postgresql://cluster:cluster@localhost:5432/cluster",
    });
    // JWT_SECRET, AUTH_SECRET_KEY, COLLAB_INTERNAL_SECRET, two storage keys, three database URLs
    expect(report.errors).toHaveLength(8);
  });
});
