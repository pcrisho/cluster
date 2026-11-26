"use client"

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import { useRouter } from "next/navigation"
import {
  api,
  setTokens,
  clearTokens,
  getFreshAccessToken,
  hasSessionHint,
  type AuthUser,
  type Tokens,
} from "./api"
import { clearThemeCookie, syncPreferences } from "./i18n/sync"
import { themeCookieValue } from "./theme/theme-cookie"

interface RegisterData {
  email: string
  password: string
  firstName: string
  lastName: string
  organizationName: string
  timezone: string
}

/**
 * A correct password that still needs a step before a session: a code (VERIFY), setting 2FA up (ENROLL), or
 * setting one's own password after an initial one (PASSWORD_CHANGE, docs/specs/auth/access-without-mail).
 */
export type MfaChallenge = {
  mfa: "VERIFY" | "ENROLL" | "PASSWORD_CHANGE"
  challengeId: string
}

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Signs in, or returns the 2FA step that must come first. */
  login: (email: string, password: string) => Promise<MfaChallenge | null>
  register: (data: RegisterData) => Promise<void>
  /** Accepts an invitation or password-reset link and signs the user in (or returns the 2FA step). */
  setPassword: (token: string, password: string) => Promise<MfaChallenge | null>
  /** Sets the person's own password after an initial one; signs in, or returns the 2FA step that must come first. */
  setInitialPassword: (
    challengeId: string,
    password: string
  ) => Promise<MfaChallenge | null>
  /** Finishes a VERIFY step with an app code or a recovery code. */
  verifyMfa: (
    challengeId: string,
    answer: { code: string } | { recoveryCode: string }
  ) => Promise<void>
  /** Finishes an ENROLL step; the session starts with `finish`, once the recovery codes are saved. */
  confirmEnrollment: (
    challengeId: string,
    code: string
  ) => Promise<{ recoveryCodes: string[]; finish: () => void }>
  logout: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

type Session = { user: AuthUser } & Tokens

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  // Set when a sign-in already wrote the render cookies, so the effect below still refreshes once.
  const cookiesChanged = useRef(false)

  // Render in the person's language, their organization's zone and theme; refresh once when they
  // differ. Signed out, the theme cookie goes so the sign-in pages show the instance theme.
  const effectiveLocale = user?.effectiveLocale
  const timeZone = user?.organization.timezone
  const theme = user ? themeCookieValue(user.organization.theme) : null
  useEffect(() => {
    if (isLoading) return
    const changed =
      effectiveLocale && timeZone
        ? syncPreferences(effectiveLocale, timeZone, theme)
        : clearThemeCookie()
    if (changed || cookiesChanged.current) {
      cookiesChanged.current = false
      router.refresh()
    }
  }, [isLoading, effectiveLocale, timeZone, theme, router])

  const fetchUser = useCallback(async () => {
    try {
      // Refresh first when no access token is in memory (a reload): /auth/me then answers at once.
      await getFreshAccessToken()
      const data = await api.get<{ user: AuthUser }>("/auth/me")
      setUser(data.user)
    } catch {
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // The session cookie is httpOnly: the hint says whether one should exist.
    const signedIn = hasSessionHint()
    // Schedule the auth bootstrap out of the effect body to satisfy
    // set-state-in-effect.
    queueMicrotask(() => {
      if (signedIn) {
        void fetchUser()
      } else {
        setIsLoading(false)
      }
    })
  }, [fetchUser])

  const startSession = useCallback((session: Session) => {
    setTokens(session)
    // Before the caller navigates, so the first app screen already renders in the right look.
    const { effectiveLocale, organization } = session.user
    cookiesChanged.current = syncPreferences(
      effectiveLocale,
      organization.timezone,
      themeCookieValue(organization.theme)
    )
    setUser(session.user)
  }, [])

  /** A session, or the 2FA step the API asked for first (no session yet). */
  const sessionOrChallenge = useCallback(
    (res: Session | MfaChallenge) => {
      if ("mfa" in res) return res
      startSession(res)
      return null
    },
    [startSession]
  )

  const login = useCallback(
    async (email: string, password: string) =>
      sessionOrChallenge(
        await api.post<Session | MfaChallenge>("/auth/login", {
          email,
          password,
        })
      ),
    [sessionOrChallenge]
  )

  const setInitialPassword = useCallback(
    async (challengeId: string, password: string) =>
      sessionOrChallenge(
        await api.post<Session | MfaChallenge>("/auth/password/initial", {
          challengeId,
          password,
        })
      ),
    [sessionOrChallenge]
  )

  const verifyMfa = useCallback(
    async (
      challengeId: string,
      answer: { code: string } | { recoveryCode: string }
    ) => {
      startSession(
        await api.post<Session>("/auth/mfa/verify", { challengeId, ...answer })
      )
    },
    [startSession]
  )

  const confirmEnrollment = useCallback(
    async (challengeId: string, code: string) => {
      const { recoveryCodes, ...session } = await api.post<
        Session & { recoveryCodes: string[] }
      >("/auth/mfa/enroll/confirm", { challengeId, code })
      return { recoveryCodes, finish: () => startSession(session) }
    },
    [startSession]
  )

  const register = useCallback(
    async (data: RegisterData) => {
      startSession(await api.post<Session>("/auth/register", data))
    },
    [startSession]
  )

  const setPassword = useCallback(
    async (token: string, password: string) =>
      sessionOrChallenge(
        await api.post<Session | MfaChallenge>("/auth/set-password", {
          token,
          password,
        })
      ),
    [sessionOrChallenge]
  )

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout", {})
    } catch {
      // ignore
    }
    clearTokens()
    cookiesChanged.current = clearThemeCookie()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        login,
        register,
        setPassword,
        setInitialPassword,
        verifyMfa,
        confirmEnrollment,
        logout,
        refreshUser: fetchUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
