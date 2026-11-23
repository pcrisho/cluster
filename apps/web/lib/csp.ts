/** Where the browser talks to: the API (and its files), the notification socket and collab. */
export interface CspUrls {
  api: string
  ws: string
  collab: string
}

/** Lesson videos (apps/api/src/modules/grow/link-hosts.ts makes these embed URLs). */
const VIDEO_HOSTS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://drive.google.com",
]

const origin = (url: string) => new URL(url).origin
/** The socket.io origin as a WebSocket origin (http → ws, https → wss). */
const wsOrigin = (url: string) => origin(url).replace(/^http/, "ws")

/**
 * The page's Content-Security-Policy (docs/specs/auth/hardening R-34): scripts only with this request's
 * nonce (and what they load), nothing embeds the app, no plugins. Styles stay 'unsafe-inline': Tailwind
 * and Radix set inline styles. `dev` adds what next dev needs (eval for React Refresh, the HMR socket).
 */
export function contentSecurityPolicy(
  nonce: string,
  urls: CspUrls,
  dev: boolean
): string {
  const api = origin(urls.api)
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${api}`,
    "font-src 'self' data:",
    `media-src 'self' blob: ${api}`,
    `connect-src 'self' ${[...new Set([api, origin(urls.ws), wsOrigin(urls.ws), origin(urls.collab)])].join(" ")}${dev ? " ws:" : ""}`,
    `frame-src ${[api, ...VIDEO_HOSTS].join(" ")}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ")
}
