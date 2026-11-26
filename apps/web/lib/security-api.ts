import { api } from "./api"

/** One of the signed-in person's sessions (GET /auth/sessions). */
export interface OwnSession {
  id: string
  current: boolean
  createdAt: string
  lastUsedAt: string
  userAgent: string | null
  ipAddress: string | null
}

/** The signed-in person's own 2FA and sessions (docs/specs/auth/hardening R-11, R-15, R-21). */
export const securityApi = {
  /** `code` (app or recovery) only when 2FA is on: a new device, which replaces the current one once confirmed. */
  startEnrollment: (currentPassword: string, code?: string) =>
    api.post<{ qrSvg: string; secret: string }>("/auth/mfa/enroll/start", {
      currentPassword,
      code,
    }),
  /** Turns 2FA on, or moves it to the new device; signs out the other sessions. */
  confirmEnrollment: (code: string) =>
    api.post<{ recoveryCodes: string[] }>("/auth/mfa/enroll/confirm", { code }),
  newRecoveryCodes: (code: string) =>
    api.post<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { code }),
  /** `code`: from the app, or a recovery code. Signs out the other sessions. */
  disable: (currentPassword: string, code: string) =>
    api.del<void>("/auth/mfa", { currentPassword, code }),

  listSessions: () => api.get<OwnSession[]>("/auth/sessions"),
  closeSession: (id: string) => api.del<void>(`/auth/sessions/${id}`),
  closeOtherSessions: () => api.post<void>("/auth/sessions/close-others", {}),
}
