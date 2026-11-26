import { NextResponse, type NextRequest } from "next/server"

import { contentSecurityPolicy } from "@/lib/csp"

// Enforced since no screen showed a violation in Report-Only (docs/specs/auth/hardening T26, T27).
const CSP_HEADER = "Content-Security-Policy"

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1"
const urls = {
  api: API_URL,
  ws: process.env.NEXT_PUBLIC_WS_URL || new URL(API_URL).origin,
  collab: process.env.NEXT_PUBLIC_COLLAB_URL || "ws://localhost:3002",
}

/** A fresh nonce per page request: Next puts it on its own scripts, the layout on next-themes'. */
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID())
  const csp = contentSecurityPolicy(
    nonce,
    urls,
    process.env.NODE_ENV !== "production"
  )
  const headers = new Headers(request.headers)
  headers.set("x-nonce", nonce)
  // Next reads the nonce from the request's policy header.
  headers.set(CSP_HEADER, csp)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set(CSP_HEADER, csp)
  return response
}

export const config = {
  matcher: [
    {
      // Pages only: static files and images carry no scripts.
      source:
        "/((?!_next/static|_next/image|favicon.svg|.*\\.(?:svg|png|jpg|jpeg|webp|ico|woff2?)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
}
