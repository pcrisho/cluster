"use client"

import { useEffect, useRef } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

import { useAuth } from "@/lib/auth-context"
import { canViewReports, isCourseManager } from "@/lib/grow-api"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const TABS = [
  { href: "/grow", key: "myLearning", show: () => true },
  { href: "/grow/catalog", key: "catalog", show: () => true },
  { href: "/grow/certificates", key: "certificates", show: () => true },
  { href: "/grow/manage", key: "manage", show: isCourseManager },
  { href: "/grow/dashboard", key: "dashboard", show: canViewReports },
  { href: "/grow/reports", key: "reports", show: canViewReports },
] as const

/** Route tabs of the Learning module; a tab appears only when the user can use it. */
export function GrowTabs() {
  const { user } = useAuth()
  const t = useTranslations("grow")
  const pathname = usePathname()
  const list = useRef<HTMLDivElement>(null)
  const tabs = TABS.filter((tab) => tab.show(user))
  const active =
    [...tabs]
      .reverse()
      .find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
      ?.href ?? "/grow"

  // On a narrow screen the tabs scroll sideways: keep the current one in view.
  useEffect(() => {
    list.current
      ?.querySelector<HTMLElement>("[aria-current=page]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" })
  }, [active])

  if (tabs.length < 2) return null

  return (
    <Tabs
      ref={list}
      value={active}
      className="max-w-full overflow-x-auto border-b"
    >
      <TabsList variant="line" aria-label={t("sections")}>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.href} value={tab.href} asChild>
            <Link
              href={tab.href}
              aria-current={active === tab.href ? "page" : undefined}
            >
              {t(tab.key)}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
