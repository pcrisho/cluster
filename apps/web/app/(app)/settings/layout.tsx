"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { settingsSections } from "@/lib/settings-nav"
import { useTranslations } from "next-intl"

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const t = useTranslations("settings.nav")
  const pathname = usePathname()
  const content = <div className="min-w-0 flex-1">{children}</div>

  if (!user) return content

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 lg:flex-row">
      {/* Below lg the sections flatten into one scrolling row of links; from lg it stays under the sticky header (4rem, 3rem with the sidebar collapsed) while the page scrolls. */}
      {/* shortcut: no max-height, fine while the longest nav (superadmin) fits a 600 px viewport. */}
      <nav
        aria-label={t("label")}
        className="flex gap-1 overflow-x-auto lg:sticky lg:top-22 lg:w-56 lg:shrink-0 lg:flex-col lg:self-start lg:overflow-visible lg:group-has-data-[collapsible=icon]/sidebar-wrapper:top-18"
      >
        {settingsSections(user).map((section) => (
          <div
            key={section.title}
            className="contents lg:mb-4 lg:flex lg:flex-col lg:gap-1"
          >
            <h2 className="hidden px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase lg:block">
              {t(section.title)}
            </h2>
            {section.items.map((item) => {
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/")
              const Icon = item.icon
              return (
                <Button
                  key={item.href}
                  asChild
                  variant={active ? "secondary" : "ghost"}
                  className="shrink-0 justify-start lg:w-full"
                  aria-current={active ? "page" : undefined}
                >
                  <Link href={item.href}>
                    <Icon />
                    {t(item.label)}
                  </Link>
                </Button>
              )
            })}
          </div>
        ))}
      </nav>
      {content}
    </div>
  )
}
