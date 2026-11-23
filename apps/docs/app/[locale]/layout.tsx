import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Inter } from "next/font/google"
import { setRequestLocale } from "next-intl/server"
import { NextIntlClientProvider } from "next-intl"
import { ThemeProvider } from "@/components/theme-provider"
import { routing } from "@/i18n/routing"
import { getDocsUrl } from "@/lib/docs-url"
import { isSupportedLocale } from "@/lib/locale-pick"

const inter = Inter({ subsets: ["latin", "latin-ext"], display: "swap", variable: "--font-inter" })

export function generateMetadata(): Metadata {
  const docsUrl = getDocsUrl()
  return {
    metadataBase: new URL(docsUrl ?? "http://localhost:3004"),
    ...(docsUrl ? {} : { robots: { index: false, follow: false } }),
  }
}

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
  if (!isSupportedLocale(locale)) notFound()
  setRequestLocale(locale)
  const messages = (await import(`@/messages/${locale}.json`)).default

  return (
    <html lang={locale} suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
