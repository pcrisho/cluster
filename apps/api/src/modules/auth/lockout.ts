/**
 * Sign-in lockout in the style of Microsoft Entra smart lockout (docs/specs/auth/hardening D-06):
 * per account, from any address, a short lock that doubles on repeat; the same wrong password typed
 * again does not count. Pure: the service stores the state in `login_throttle`.
 */
export const LOCKOUT = {
  threshold: 10,
  windowMs: 15 * 60_000,
  baseLockMs: 60_000,
  maxLockMs: 30 * 60_000,
  levelDecayMs: 24 * 60 * 60_000,
  rememberedWrong: 3,
};

export interface LockState {
  failures: number;
  windowStart: Date;
  lockedUntil: Date | null;
  lockLevel: number;
  lastLockAt: Date | null;
  recentWrong: string[];
}

/** How long the account is still locked, in ms (0 = not locked). */
export function lockedFor(state: LockState | null, now: Date): number {
  return Math.max(0, (state?.lockedUntil?.getTime() ?? 0) - now.getTime());
}

/**
 * The state after a failed attempt. `fingerprint` identifies the wrong password (a keyed hash), so
 * repeating it does not count; null for counters that do not care (the per-address one).
 */
export function afterFailure(
  state: LockState | null,
  fingerprint: string | null,
  now: Date,
): LockState {
  const t = now.getTime();
  const fresh = !state || t - state.windowStart.getTime() > LOCKOUT.windowMs;
  const decayed =
    !state?.lastLockAt || t - state.lastLockAt.getTime() > LOCKOUT.levelDecayMs;
  const s: LockState = {
    failures: fresh ? 0 : state.failures,
    windowStart: fresh ? now : state.windowStart,
    lockedUntil: state?.lockedUntil ?? null,
    lockLevel: decayed ? 0 : state!.lockLevel,
    lastLockAt: state?.lastLockAt ?? null,
    recentWrong: fresh ? [] : state.recentWrong,
  };
  if (fingerprint && s.recentWrong.includes(fingerprint)) return s;
  s.failures += 1;
  if (fingerprint)
    s.recentWrong = [...s.recentWrong, fingerprint].slice(
      -LOCKOUT.rememberedWrong,
    );
  if (fingerprint && s.failures >= LOCKOUT.threshold) {
    const duration = Math.min(
      LOCKOUT.baseLockMs * 2 ** s.lockLevel,
      LOCKOUT.maxLockMs,
    );
    return {
      ...s,
      failures: 0,
      recentWrong: [],
      lockedUntil: new Date(t + duration),
      lockLevel: s.lockLevel + 1,
      lastLockAt: now,
    };
  }
  return s;
}

/** How long an address stays refused once it reached `limit` failures in the window, in ms. */
export function ipBlockedFor(
  state: LockState | null,
  limit: number,
  now: Date,
): number {
  if (!state || state.failures < limit) return 0;
  return Math.max(
    0,
    state.windowStart.getTime() + LOCKOUT.windowMs - now.getTime(),
  );
}
