import type { Metadata } from "next"
import { Geist_Mono } from "next/font/google"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getTranslations } from "next-intl/server"
import { headers } from "next/headers"

import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AuthProvider } from "@/lib/auth-context"
import { Toaster } from "@/components/ui/sonner"
import { I18nBridge } from "@/components/i18n-bridge"
import { cn } from "@/lib/utils"
import { FONT_CLASSNAMES } from "@/lib/theme/fonts"
import { loadTheme } from "@/lib/theme/server"

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata")
  return {
    title: { template: "%s | Cluster", default: t("title") },
    description: t("description"),
    icons: { icon: "/favicon.svg" },
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const [locale, { css: themeCss, glass }, requestHeaders] = await Promise.all([
    getLocale(),
    loadTheme(),
    headers(),
  ])
  // Set by proxy.ts: next-themes' inline script needs it under the Content-Security-Policy.
  const nonce = requestHeaders.get("x-nonce") ?? undefined
  return (
    <html
      lang={locale}
      data-glass={glass ?? undefined}
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        FONT_CLASSNAMES
      )}
    >
      {themeCss && (
        <head>
          <style
            id="instance-theme"
            dangerouslySetInnerHTML={{ __html: themeCss }}
          />
        </head>
      )}
      <body>
        <NextIntlClientProvider>
          <I18nBridge />
          <ThemeProvider nonce={nonce}>
            <TooltipProvider>
              <AuthProvider>{children}</AuthProvider>
            </TooltipProvider>
            <Toaster />
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
