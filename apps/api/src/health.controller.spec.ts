import { summarize } from "./health.controller";

describe("summarize", () => {
  it("is ok when everything answers", () => {
    expect(summarize({ database: "ok", redis: "ok", storage: "ok" })).toEqual({
      status: "ok",
      checks: { database: "ok", redis: "ok", storage: "ok" },
    });
  });

  it.each(["redis", "storage"] as const)("is degraded when %s is down", (k) => {
    const checks = { database: "ok", redis: "ok", storage: "ok", [k]: "down" };
    expect(summarize(checks as Parameters<typeof summarize>[0]).status).toBe(
      "degraded",
    );
  });
});
