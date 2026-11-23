import type { Seeds } from "@cluster/theme"
import { isTokenExpiring } from "@/lib/collab/access-token"
import { networkErrorMessage, translateError } from "@/lib/i18n/error-message"

/** The refresh and file tokens live in httpOnly cookies the page never sees; only the access token is ours. */
type Tokens = { accessToken: string }

/** Feature modules; mirrors the API's ModuleKey enum. */
type ModuleKey = "KNOW" | "GROW" | "CONNECT" | "LIFE"
type UserRole = "ADMIN" | "MANAGER" | "COLLABORATOR"
/** Mirrors SUPPORTED_LOCALES in apps/api/src/common/locale.ts. */
type Locale = "en" | "es"
/** Organization-wide permissions an admin grants to specific people; mirrors the API's Capability enum. */
type Capability =
  | "KNOW_SPACE_CREATE"
  | "KNOW_SPACE_DELETE"
  | "GROW_COURSE_MANAGE"

type AuthUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  avatarUrl: string | null
  /** The person's language; null = the instance default. */
  locale: Locale | null
  /** The language the app is shown in: `locale`, else the organization's, else the instance's. */
  effectiveLocale: Locale
  isSuperAdmin: boolean
  organizationId: string
  /** `timezone` is IANA: every instant is shown in it; `locale` is the language of members with no choice (null = the instance's); `logoUrl` is a storage key. */
  organization: {
    id: string
    name: string
    slug: string
    timezone: string
    logoUrl: string | null
    locale: Locale | null
    /** The organization's own theme seeds; null = none, or customization is off for it. */
    theme: Seeds | null
    /** The instance allows organization themes and the superadmin left it on for this organization. */
    themingAllowed: boolean
    /** Members who are not ADMIN may edit their own name, avatar, phone and bio. */
    memberProfileEditing: boolean
    /** Main-node isolation is in effect: the instance allows it and the organization turned it on. */
    isolated: boolean
  }
  /** Effective modules: enabled by the instance and by the organization. */
  modules: ModuleKey[]
  capabilities: Capability[]
  /** Manages an area of the organization chart (sees its reports). */
  managesArea: boolean
  /** Two-step verification is on. */
  mfaEnabled: boolean
  /** Unused recovery codes; null while 2FA is off. */
  recoveryCodesLeft: number | null
  /** Their role cannot go without it (superadmin, or ADMIN where the organization requires it). */
  mfaRequired: boolean
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"

let accessToken: string | null = null
let refreshPromise: Promise<string | null> | null = null

/** Not a secret: only says a session cookie should exist, so a signed-out visit skips the refresh call. */
const SIGNED_IN = "cluster:signed-in"

export function setTokens(tokens: Tokens) {
  accessToken = tokens.accessToken
  localStorage.setItem(SIGNED_IN, "1")
}

export function clearTokens() {
  accessToken = null
  localStorage.removeItem(SIGNED_IN)
  // Left behind by builds that kept the refresh token in the page.
  localStorage.removeItem("refreshToken")
  refreshPromise = null
}

export function hasSessionHint(): boolean {
  return localStorage.getItem(SIGNED_IN) === "1"
}

export function getAccessToken(): string | null {
  return accessToken
}

/** Access token for the collab socket: refreshed first when it is within 30 s of expiring. */
export async function getFreshAccessToken(): Promise<string> {
  if (!isTokenExpiring(accessToken, Date.now(), 30_000))
    return accessToken ?? ""
  try {
    refreshPromise = refreshPromise || refreshAccessToken()
    const newToken = await refreshPromise
    return newToken ?? ""
  } finally {
    refreshPromise = null
  }
}

/** Refreshes now even if the access token looks valid: the server said this session's token is no longer enough. */
export async function forceRefresh(): Promise<string | null> {
  try {
    refreshPromise = refreshPromise || refreshAccessToken()
    return await refreshPromise
  } finally {
    refreshPromise = null
  }
}

/**
 * Tabs share the session cookie and every refresh rotates it, so refreshes run one at a time
 * across tabs (each sends the cookie the previous one left). The API also tolerates a rotated
 * token for a few seconds, for a response lost on the way back.
 */
async function refreshAccessToken(): Promise<string | null> {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return await navigator.locks.request(
      "cluster:auth-refresh",
      refreshWithLatestToken
    )
  }
  return refreshWithLatestToken()
}

async function refreshWithLatestToken(): Promise<string | null> {
  if (!hasSessionHint()) return null

  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })

  if (!res.ok) {
    // The session is over (or never existed); a server hiccup keeps the hint for the next try.
    if (res.status === 401 || res.status === 403) clearTokens()
    return null
  }

  const data = await res.json()
  setTokens(data)
  return data.accessToken
}

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  /** Values the translated message needs (errors.codes.* in messages/). */
  params?: Record<string, string | number>

  constructor(
    message: string,
    code: string,
    status: number,
    details?: unknown
  ) {
    super(message)
    this.name = "ApiError"
    this.code = code
    this.status = status
    this.details = details
    const params = (details as { params?: unknown } | undefined)?.params
    if (params && typeof params === "object")
      this.params = params as Record<string, string | number>
  }
}

/** fetch() that turns "the request never reached the API" into an ApiError with code NETWORK. */
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch (err) {
    if (init.signal?.aborted) throw err
    throw new ApiError("Can't reach the server.", "NETWORK", 0)
  }
}

/** The answer to a call, with the one session refresh a 401 may need. The caller reads the errors. */
async function requestResponse(path: string, options: RequestInit = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  }

  if (!isFormData) {
    headers["Content-Type"] = "application/json"
  }

  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`
  }

  // credentials: the API sets/clears the httpOnly file cookie used by <img> and downloads.
  const init: RequestInit = { ...options, headers, credentials: "include" }
  let res = await send(`${API_BASE}${path}`, init)

  // A 401 from sign-in itself means wrong credentials: there is no session to refresh.
  if (
    res.status === 401 &&
    hasSessionHint() &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/refresh")
  ) {
    try {
      refreshPromise = refreshPromise || refreshAccessToken()
      const newToken = await refreshPromise
      if (newToken) {
        headers["Authorization"] = `Bearer ${newToken}`
        res = await send(`${API_BASE}${path}`, init)
      }
    } finally {
      refreshPromise = null
    }
  }

  return res
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await requestResponse(path, options)
  if (!res.ok) throw toApiError(res.status, await res.json().catch(() => ({})))

  if (res.status === 204) return undefined as T
  return res.json()
}

/** A file answer (an export): the blob, and the headers the caller reads (such as a count). */
export async function requestFile(
  path: string,
  options: RequestInit = {}
): Promise<{ blob: Blob; headers: Headers }> {
  const res = await requestResponse(path, options)
  if (!res.ok) throw toApiError(res.status, await res.json().catch(() => ({})))
  return { blob: await res.blob(), headers: res.headers }
}

type ErrorBody = {
  message?: string | string[]
  code?: string
  error?: { code?: string; message?: string }
}

function toApiError(status: number, body: ErrorBody): ApiError {
  const code = body.error?.code ?? body.code ?? mapStatusToCode(status)
  const message =
    body.error?.message ??
    (Array.isArray(body.message) ? body.message.join(". ") : body.message) ??
    mapStatusToMessage(status, code)
  return new ApiError(message, code, status, body)
}

/**
 * Sends a file as the whole request body (files too big for multipart in memory, such as lesson
 * videos) and reports the upload progress (0–1), which fetch cannot. Fails with an ApiError like
 * the other calls; `signal` cancels it with an AbortError.
 */
async function uploadFile<T>(
  path: string,
  file: File,
  {
    onProgress,
    signal,
  }: { onProgress?: (fraction: number) => void; signal?: AbortSignal } = {}
): Promise<T> {
  const token = await getFreshAccessToken()
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", `${API_BASE}${path}`)
    xhr.withCredentials = true
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`)
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream"
    )
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total)
    }
    xhr.onload = () => {
      let body: unknown = {}
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        // Not JSON (a proxy's error page): the status decides the message.
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else reject(toApiError(xhr.status, body as ErrorBody))
    }
    xhr.onerror = () =>
      reject(new ApiError("Can't reach the server.", "NETWORK", 0))
    xhr.onabort = () =>
      reject(new DOMException("The upload was cancelled", "AbortError"))
    signal?.addEventListener("abort", () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

function mapStatusToCode(status: number): string {
  if (status === 401) return "UNAUTHORIZED"
  if (status === 403) return "FORBIDDEN"
  if (status === 404) return "NOT_FOUND"
  if (status === 409) return "CONFLICT"
  if (status === 400) return "BAD_REQUEST"
  if (status >= 500) return "SERVER_ERROR"
  return "UNKNOWN_ERROR"
}

function mapStatusToMessage(status: number, code: string): string {
  if (code && code !== mapStatusToCode(status)) return code
  if (status === 401) return "Your session expired. Sign in again."
  if (status === 403) return "You do not have permission to do this."
  if (status === 404) return "Not found."
  if (status === 409)
    return "This conflicts with a recent change. Reload and try again."
  if (status === 400) return "Invalid request."
  if (status >= 500) return "Something went wrong on the server. Try again."
  return "Something went wrong."
}

/**
 * Extract a user-friendly error message from any thrown value, in the person's language
 * (lib/i18n/error-message.ts). Use in catch blocks to display toasts or inline errors.
 */
export function getErrorMessage(err: unknown): string {
  if (err instanceof ApiError)
    return err.code === "NETWORK" ? networkErrorMessage() : translateError(err)
  if (err instanceof Error) return err.message
  if (typeof err === "string") return err
  return "Something went wrong."
}

/**
 * Extract the error code from a thrown value, if it's an ApiError.
 * Returns null otherwise.
 */
export function getErrorCode(err: unknown): string | null {
  if (err instanceof ApiError) return err.code
  return null
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  postFile: (path: string, body: unknown) =>
    requestFile(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(path: string, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
  upload: <T>(path: string, body: FormData) =>
    request<T>(path, { method: "POST", body }),
  uploadFile,
}

export type { Tokens, AuthUser, ModuleKey, UserRole, Capability, Locale }
