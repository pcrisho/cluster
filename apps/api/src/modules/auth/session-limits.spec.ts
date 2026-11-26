import {
  ROTATION_GRACE_MS,
  extendedIdle,
  newExpiry,
  refreshDecision,
  sessionEnded,
} from "./session-limits";

const H = 60 * 60 * 1000;
const D = 24 * H;
const now = new Date("2026-11-02T12:00:00Z");
const at = (ms: number) => new Date(now.getTime() + ms);

describe("session limits", () => {
  it("gives a person 14 days in total and 7 idle", () => {
    expect(newExpiry(now, false)).toEqual({
      absoluteExpiresAt: at(14 * D),
      idleExpiresAt: at(7 * D),
    });
  });

  it("gives a superadmin 12 hours in total and 1 idle", () => {
    expect(newExpiry(now, true)).toEqual({
      absoluteExpiresAt: at(12 * H),
      idleExpiresAt: at(H),
    });
  });

  it("extends the idle limit on use but never past the total", () => {
    const person = { superAdmin: false, absoluteExpiresAt: at(14 * D) };
    expect(extendedIdle(at(D), person)).toEqual(at(8 * D));
    expect(extendedIdle(at(13 * D), person)).toEqual(at(14 * D));
    const admin = { superAdmin: true, absoluteExpiresAt: at(12 * H) };
    expect(extendedIdle(at(11.5 * H), admin)).toEqual(at(12 * H));
  });

  it("ends a session that is revoked or past either limit", () => {
    const live = {
      revokedAt: null,
      idleExpiresAt: at(H),
      absoluteExpiresAt: at(2 * H),
    };
    expect(sessionEnded(live, now)).toBe(false);
    expect(sessionEnded({ ...live, revokedAt: now }, now)).toBe(true);
    expect(sessionEnded(live, at(H))).toBe(true);
    expect(sessionEnded({ ...live, idleExpiresAt: at(3 * H) }, at(2 * H))).toBe(
      true,
    );
  });
});

describe("refresh decision", () => {
  const live = {
    revokedAt: null,
    idleExpiresAt: at(D),
    absoluteExpiresAt: at(2 * D),
    rotatedAt: now,
  };

  it("rotates on the current token", () => {
    expect(refreshDecision(live, "current", at(D - 1))).toBe("rotate");
  });

  it("rotates again on the previous token within the grace window", () => {
    expect(refreshDecision(live, "previous", at(ROTATION_GRACE_MS))).toBe(
      "rotate",
    );
  });

  it("calls the previous token past the grace window a reuse", () => {
    expect(refreshDecision(live, "previous", at(ROTATION_GRACE_MS + 1))).toBe(
      "reuse",
    );
  });

  it("ends a revoked or expired session whatever the token", () => {
    expect(refreshDecision({ ...live, revokedAt: now }, "current", now)).toBe(
      "ended",
    );
    expect(refreshDecision(live, "current", at(D))).toBe("ended");
    expect(
      refreshDecision({ ...live, revokedAt: now }, "previous", at(H)),
    ).toBe("ended");
  });
});
