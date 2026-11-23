import {
  afterFailure,
  ipBlockedFor,
  LOCKOUT,
  lockedFor,
  type LockState,
} from "./lockout";

const t0 = new Date("2026-11-02T12:00:00Z").getTime();
const at = (ms: number) => new Date(t0 + ms);
const MIN = 60_000;

/** Ten distinct wrong passwords, one second apart, from `state`. */
function tenFailures(state: LockState | null, start: number, tag: string) {
  let s = state;
  for (let i = 0; i < LOCKOUT.threshold; i++)
    s = afterFailure(s, `${tag}-${i}`, at(start + i * 1000));
  return s!;
}

describe("account lockout (Entra smart lockout style)", () => {
  it("locks for one minute at the tenth failure, not before", () => {
    let s: LockState | null = null;
    for (let i = 0; i < 9; i++) s = afterFailure(s, `w${i}`, at(i * 1000));
    expect(lockedFor(s, at(9000))).toBe(0);
    s = afterFailure(s, "w9", at(9000));
    expect(lockedFor(s, at(9000))).toBe(MIN);
    expect(lockedFor(s, at(9000 + MIN))).toBe(0);
  });

  it("does not count the same wrong password twice", () => {
    let s: LockState | null = null;
    for (let i = 0; i < 20; i++)
      s = afterFailure(s, i % 2 ? "typo-a" : "typo-b", at(i * 1000));
    expect(s!.failures).toBe(2);
    expect(lockedFor(s, at(20_000))).toBe(0);
  });

  it("doubles each new lock up to 30 minutes", () => {
    let s: LockState | null = null;
    let clock = 0;
    const durations: number[] = [];
    for (let round = 0; round < 7; round++) {
      s = tenFailures(s, clock, `r${round}`);
      const lockedAt = clock + (LOCKOUT.threshold - 1) * 1000;
      durations.push(lockedFor(s, at(lockedAt)) / MIN);
      clock = lockedAt + lockedFor(s, at(lockedAt)) + 1000;
    }
    expect(durations).toEqual([1, 2, 4, 8, 16, 30, 30]);
  });

  it("starts counting again after 15 minutes without failures", () => {
    let s: LockState | null = null;
    for (let i = 0; i < 9; i++) s = afterFailure(s, `w${i}`, at(i * 1000));
    s = afterFailure(s, "late", at(16 * MIN));
    expect(s.failures).toBe(1);
    expect(lockedFor(s, at(16 * MIN))).toBe(0);
  });

  it("forgets the level a day after the last lock", () => {
    let s = tenFailures(null, 0, "a");
    s = tenFailures(s, 2 * MIN, "b");
    expect(s.lockLevel).toBe(2);
    s = tenFailures(s, 25 * 60 * MIN, "c");
    expect(lockedFor(s, at(25 * 60 * MIN + 9000))).toBe(MIN);
  });
});

describe("per-address ceiling", () => {
  it("blocks an address once it reached the limit of failures in the window, until the window ends", () => {
    let s: LockState | null = null;
    for (let i = 0; i < 5; i++) s = afterFailure(s, null, at(i * 1000));
    expect(ipBlockedFor(s, 5, at(5000))).toBeGreaterThan(0);
    expect(ipBlockedFor(s, 6, at(5000))).toBe(0);
    expect(ipBlockedFor(s, 5, at(LOCKOUT.windowMs + 1))).toBe(0);
  });
});
