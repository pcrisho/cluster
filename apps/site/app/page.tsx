"use client"

import * as React from "react"
import Link from "next/link"
import { Inter } from "next/font/google"
import { pickLocale, getStoredLocale } from "@/lib/locale-pick"

// globals.css maps `--font-sans` to `--font-inter`; next/font self-hosts at build time.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
})

export default function RootPage() {
  React.useEffect(() => {
    const stored = getStoredLocale()
    const languages =
      typeof navigator !== "undefined" ? navigator.languages : []
    const target = pickLocale(stored, languages)
    const hash = typeof window !== "undefined" ? window.location.hash : ""
    window.location.replace(`/${target}/${hash}`)
  }, [])

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <title>Cluster</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </head>
      <body className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center font-sans text-foreground antialiased">
        <noscript>
          <div className="flex max-w-sm flex-col items-center gap-4 rounded-xl border border-border bg-card p-8">
            <h1 className="text-lg font-bold text-foreground">Cluster</h1>
            <p className="text-sm text-muted-foreground">
              Select your language / Selecciona tu idioma:
            </p>
            <div className="flex gap-4">
              <Link
                href="/en/"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                English
              </Link>
              <Link
                href="/es/"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Español
              </Link>
            </div>
          </div>
        </noscript>
      </body>
    </html>
  )
}
