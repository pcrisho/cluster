import { DEFAULT_LIFETIME_HOURS, isValidLifetime, lifetimeSeconds } from "./access-lifetimes";

describe("access link lifetimes", () => {
  it("INVITE offers 1, 3, 7, 14 and 30 days, default 7", () => {
    expect([24, 72, 168, 336, 720].map((h) => isValidLifetime("INVITE", h))).toEqual([true, true, true, true, true]);
    expect(DEFAULT_LIFETIME_HOURS.INVITE).toBe(168);
    expect(isValidLifetime("INVITE", 24 * 31)).toBe(false);
  });

  it("RESET offers 1, 24 and 72 hours, default 24", () => {
    expect([1, 24, 72].map((h) => isValidLifetime("RESET", h))).toEqual([true, true, true]);
    expect(DEFAULT_LIFETIME_HOURS.RESET).toBe(24);
    expect(isValidLifetime("RESET", 168)).toBe(false);
  });

  it("rejects anything that is not a listed whole number of hours", () => {
    expect(isValidLifetime("RESET", 2)).toBe(false);
    expect(isValidLifetime("RESET", 1.5)).toBe(false);
    expect(isValidLifetime("RESET", Number.NaN)).toBe(false);
    expect(isValidLifetime("RESET", "24" as unknown as number)).toBe(false);
  });

  it("converts hours to seconds", () => {
    expect(lifetimeSeconds(24)).toBe(86_400);
  });
});
