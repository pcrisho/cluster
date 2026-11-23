"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTheme } from "next-themes"
import { MenuIcon, MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { getDemoUrl } from "@/lib/demo-url"
import { getDocsUrl, getGithubUrl } from "@/lib/site-links"
import { setStoredLocale } from "@/lib/locale-pick"
import { cn } from "@/lib/utils"

const emptySubscribe = () => () => {}

export function SiteHeader() {
  const t = useTranslations("nav")
  const locale = useLocale()
  const router = useRouter()
  const { theme, setTheme, resolvedTheme } = useTheme()
  const mounted = React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 8)
    }
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const demoUrl = getDemoUrl()
  const ctaHref = demoUrl ?? "#contact"
  const isExternal = Boolean(demoUrl && demoUrl.startsWith("https:"))

  const docsUrl = getDocsUrl()
  const githubUrl = getGithubUrl()
  const links = [
    { href: "#know", label: t("know"), external: false },
    { href: "#grow", label: t("grow"), external: false },
    { href: "#connect", label: t("connect"), external: false },
    { href: "#platform", label: t("platform"), external: false },
    { href: "#open-core", label: t("openSource"), external: false },
    { href: "#faq", label: t("faq"), external: false },
    ...(docsUrl ? [{ href: docsUrl, label: t("docs"), external: true }] : []),
    ...(githubUrl
      ? [{ href: githubUrl, label: t("github"), external: true }]
      : []),
  ]

  const otherLocale = locale === "en" ? "es" : "en"
  const switchLocaleText = locale === "en" ? "ES" : "EN"
  const switchLocaleAria = t("switchLanguage")

  const handleLocaleSwitch = () => {
    setStoredLocale(otherLocale)
    const hash = typeof window !== "undefined" ? window.location.hash : ""
    router.push(`/${otherLocale}/${hash}`)
  }

  const toggleTheme = () => {
    if (theme === "light") {
      setTheme("dark")
    } else if (theme === "dark") {
      setTheme("system")
    } else {
      setTheme("light")
    }
  }

  const renderThemeIcon = () => {
    if (!mounted) {
      return <SunIcon className="size-4 opacity-0" aria-hidden />
    }
    const current = resolvedTheme || theme
    return current === "dark" ? (
      <MoonIcon className="size-4" aria-hidden />
    ) : (
      <SunIcon className="size-4" aria-hidden />
    )
  }

  return (
    <header
      className={cn(
        "enter sticky top-0 z-40 w-full transition-colors duration-150 [--enter-shift:-0.5rem]",
        scrolled
          ? "border-b border-border/60 bg-background/70 backdrop-blur-xl backdrop-saturate-150"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-8">
          <Link
            href={`/${locale}/`}
            className="flex items-center gap-2.5 font-semibold text-foreground"
          >
            <Image
              src="/Imagotipo.svg"
              alt="Cluster"
              width={28}
              height={28}
              className="size-7"
              priority
            />
            <span className="text-base font-bold tracking-tight">Cluster</span>
          </Link>

          <nav
            aria-label={t("mainNavigation")}
            className="hidden items-center gap-4 whitespace-nowrap xl:flex"
          >
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                {...(link.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="text-sm font-medium text-foreground/75 transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-3 xl:flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLocaleSwitch}
            aria-label={switchLocaleAria}
            className="text-xs font-semibold"
          >
            {switchLocaleText}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={t("toggleTheme")}
          >
            {renderThemeIcon()}
          </Button>

          <Button asChild size="sm">
            <a
              href={ctaHref}
              {...(isExternal
                ? { target: "_blank", rel: "noopener noreferrer" }
                : {})}
            >
              {t("requestDemo")}
            </a>
          </Button>
        </div>

        <div className="flex items-center gap-2 xl:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLocaleSwitch}
            aria-label={switchLocaleAria}
            className="px-2 text-xs font-semibold"
          >
            {switchLocaleText}
          </Button>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleTheme}
            aria-label={t("toggleTheme")}
          >
            {renderThemeIcon()}
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("toggleMenu")}
              >
                <MenuIcon className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-left">
                  <Image
                    src="/Imagotipo.svg"
                    alt="Cluster"
                    width={24}
                    height={24}
                    className="size-6"
                  />
                  <span>Cluster</span>
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-4 px-4 py-6">
                {[
                  ...links,
                  { href: "#contact", label: t("contact"), external: false },
                ].map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileOpen(false)}
                    {...(link.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className="text-sm font-medium text-foreground/75 transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </a>
                ))}
                <div className="border-t border-border pt-4">
                  <Button asChild className="w-full">
                    <a
                      href={ctaHref}
                      onClick={() => setMobileOpen(false)}
                      {...(isExternal
                        ? { target: "_blank", rel: "noopener noreferrer" }
                        : {})}
                    >
                      {t("requestDemo")}
                    </a>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
