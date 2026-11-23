import { notFound } from "next/navigation"
import { Geist, Geist_Mono, Inter } from "next/font/google"
import { setRequestLocale } from "next-intl/server"
import { NextIntlClientProvider } from "next-intl"
import { ThemeProvider } from "@/components/theme-provider"
import { routing } from "@/i18n/routing"
import { isSupportedLocale } from "@/lib/locale-pick"

// globals.css maps `--font-sans` to `--font-inter`; next/font self-hosts both at build time.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
})
const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
})

// Headings (globals.css `--font-heading`) and their accent phrase (`font-accent`); Inter for the rest.
const geist = Geist({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-geist",
})

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  if (!isSupportedLocale(locale)) {
    notFound()
  }

  setRequestLocale(locale)

  const messages = (await import(`@/messages/${locale}.json`)).default

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} ${geist.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        {/* Plain inline script, not next/script: in the static export `beforeInteractive` is queued until
            the runtime starts, so the page painted, hid and then animated. This runs before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try { if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) document.documentElement.classList.add("js-motion") } catch {}`,
          }}
        />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
