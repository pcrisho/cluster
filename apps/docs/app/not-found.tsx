import type { Metadata } from "next"
import Link from "next/link"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import en from "@/messages/en.json"
import es from "@/messages/es.json"

const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-inter" })

export const metadata: Metadata = {
  title: `${en.chrome.notFoundTitle} · ${es.chrome.notFoundTitle}`,
  robots: { index: false, follow: false },
}

// A static host serves one /404.html for every unknown path, so it speaks both languages.
export default function NotFound() {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <main className="flex max-w-md flex-col items-center gap-6 rounded-xl border border-border bg-card p-8">
            <p className="text-sm font-medium text-muted-foreground">404 · Cluster</p>
            {[en, es].map((m, i) => (
              <div key={i} lang={i ? "es" : "en"} className="flex flex-col gap-2">
                <p role={i ? undefined : "heading"} aria-level={i ? undefined : 1} className="text-lg font-bold text-foreground">
                  {m.chrome.notFoundTitle}
                </p>
                <p className="text-sm text-muted-foreground">{m.chrome.notFoundBody}</p>
              </div>
            ))}
            <div className="flex gap-4">
              <Link href="/en/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                English
              </Link>
              <Link href="/es/" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Español
              </Link>
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  )
}
