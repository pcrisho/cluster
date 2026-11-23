import { Logger } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import { FailOpenThrottlerStorage } from "./throttler-storage";

const record = {
  totalHits: 3,
  timeToExpire: 40,
  isBlocked: true,
  timeToBlockExpire: 40,
};

describe("FailOpenThrottlerStorage", () => {
  let warn: jest.SpyInstance;
  beforeEach(() => {
    warn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const failing = (): ThrottlerStorage => ({
    increment: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
  });

  it("passes the store's answer through while it works", async () => {
    const inner: ThrottlerStorage = {
      increment: jest.fn().mockResolvedValue(record),
    };
    await expect(
      new FailOpenThrottlerStorage(inner).increment(
        "k",
        60000,
        10,
        0,
        "default",
      ),
    ).resolves.toEqual(record);
  });

  it("lets the request through when the store fails", async () => {
    const storage = new FailOpenThrottlerStorage(failing());
    await expect(
      storage.increment("k", 60000, 10, 0, "default"),
    ).resolves.toEqual({
      totalHits: 0,
      timeToExpire: 0,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });

  it("warns at most once a minute while the store is down", async () => {
    let now = 0;
    const storage = new FailOpenThrottlerStorage(failing(), () => now);
    for (let i = 0; i < 5; i++)
      await storage.increment("k", 60000, 10, 0, "default");
    expect(warn).toHaveBeenCalledTimes(1);
    now = 61_000;
    await storage.increment("k", 60000, 10, 0, "default");
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
