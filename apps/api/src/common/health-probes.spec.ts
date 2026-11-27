import { pingCollab, summarizeSystemStatus } from "./health-probes";

describe("health-probes", () => {
  describe("summarizeSystemStatus", () => {
    it("is ok when required and configured optional checks pass", () => {
      expect(
        summarizeSystemStatus({
          database: "ok",
          redis: "ok",
          storage: "ok",
          collab: "ok",
        }),
      ).toBe("ok");
      expect(
        summarizeSystemStatus({
          database: "ok",
          redis: "ok",
          storage: "ok",
          collab: "unconfigured",
        }),
      ).toBe("ok");
    });

    it("is degraded when redis, storage, or collab is down", () => {
      expect(
        summarizeSystemStatus({
          database: "ok",
          redis: "down",
          storage: "ok",
          collab: "ok",
        }),
      ).toBe("degraded");
      expect(
        summarizeSystemStatus({
          database: "ok",
          redis: "ok",
          storage: "down",
          collab: "ok",
        }),
      ).toBe("degraded");
      expect(
        summarizeSystemStatus({
          database: "ok",
          redis: "ok",
          storage: "ok",
          collab: "down",
        }),
      ).toBe("degraded");
    });

    it("is down when database is down", () => {
      expect(
        summarizeSystemStatus({
          database: "down",
          redis: "ok",
          storage: "ok",
          collab: "ok",
        }),
      ).toBe("down");
    });
  });

  describe("pingCollab", () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("returns unconfigured when COLLAB_URL is empty", async () => {
      expect(await pingCollab(undefined)).toEqual({ status: "unconfigured" });
      expect(await pingCollab("   ")).toEqual({ status: "unconfigured" });
    });

    it("parses metrics when collab /health answers 200", async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ documents: 3, connections: 7, uptime: 120 }),
      }) as unknown as typeof fetch;

      expect(await pingCollab("http://collab:3002/")).toEqual({
        status: "ok",
        documents: 3,
        connections: 7,
        uptimeSeconds: 120,
      });
      expect(global.fetch).toHaveBeenCalledWith(
        "http://collab:3002/health",
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it("returns down when collab fails or answers non-200", async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({ ok: false }) as unknown as typeof fetch;
      expect(await pingCollab("http://collab:3002")).toEqual({
        status: "down",
      });

      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error("ECONNREFUSED")) as unknown as typeof fetch;
      expect(await pingCollab("http://collab:3002")).toEqual({
        status: "down",
      });
    });
  });
});
