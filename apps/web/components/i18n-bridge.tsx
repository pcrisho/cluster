"use client"

import { useLocale, useTranslations } from "next-intl"
import { setErrorCatalog } from "@/lib/i18n/error-message"
import { setPlainTranslator } from "@/lib/i18n/plain"

/**
 * Hands the catalogs to plain code: getErrorMessage (used in every catch) and tPlain (editor
 * extensions, upload checks), which cannot call hooks. Renders nothing.
 */
export function I18nBridge() {
  const t = useTranslations()
  const locale = useLocale()
  const tAny = t as unknown as ((key: string, params?: Record<string, string | number>) => string) & {
    has: (key: string) => boolean
  }
  setErrorCatalog(
    { has: (key) => tAny.has(`errors.${key}`), t: (key, params) => tAny(`errors.${key}`, params) },
    locale
  )
  setPlainTranslator((key, params) => tAny(key, params))
  return null
}
