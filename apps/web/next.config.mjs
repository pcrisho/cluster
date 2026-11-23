import { fileURLToPath } from 'node:url'
import pkg from '@next/env'
import createNextIntlPlugin from 'next-intl/plugin'
const { loadEnvConfig } = pkg

loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production')

// Baseline security headers for every page. A strict Content-Security-Policy needs per-request
// nonces for Next's inline scripts and is tracked separately.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // Browsers ignore HSTS over plain http, so this is harmless on an http intranet.
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Self-contained server (apps/web/server.js) for the Docker image.
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },
}

// Language and zone of every render: i18n/request.ts.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

export default withNextIntl(nextConfig)
