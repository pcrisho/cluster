"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { SUPPORTED_LOCALES, LOCALE_STORAGE_KEY } from "@/lib/locale-pick"

// The other language, same page (parity makes it exist). The choice is remembered; storage can fail.
export function LanguageSwitch({ locale }: { locale: string }) {
  const t = useTranslations("chrome")
  const pathname = usePathname()
  return (
    <nav aria-label={t("language")} className="flex items-center gap-1 text-sm">
      {SUPPORTED_LOCALES.map((other) => {
        const target = pathname.replace(`/${locale}`, `/${other}`) || `/${other}/`
        const active = other === locale
        return (
          <a
            key={other}
            href={target}
            hrefLang={other}
            lang={other}
            aria-current={active ? "true" : undefined}
            onClick={() => {
              try {
                window.localStorage.setItem(LOCALE_STORAGE_KEY, other)
              } catch {}
            }}
            className={active ? "rounded-md px-2 py-1 font-medium text-foreground" : "rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"}
          >
            {other.toUpperCase()}
          </a>
        )
      })}
    </nav>
  )
}
