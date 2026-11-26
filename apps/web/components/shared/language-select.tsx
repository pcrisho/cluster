"use client"

import { useTranslations } from "next-intl"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/locales"

const DEFAULT = "default"

/**
 * A language, each named in itself. With `instanceDefault`, it also offers "Instance default"
 * (the value null): the person follows whatever the instance uses.
 */
export function LanguageSelect({
  id,
  value,
  onValueChange,
  instanceDefault,
  disabled,
}: {
  id?: string
  value: Locale | null
  onValueChange: (value: Locale | null) => void
  instanceDefault?: Locale
  disabled?: boolean
}) {
  const t = useTranslations("languagePicker")
  return (
    <Select
      value={value ?? DEFAULT}
      onValueChange={(v) => onValueChange(v === DEFAULT ? null : (v as Locale))}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full sm:w-64">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {instanceDefault && (
          <SelectItem value={DEFAULT}>
            {t("instanceDefault", { language: LOCALE_NAMES[instanceDefault] })}
          </SelectItem>
        )}
        {SUPPORTED_LOCALES.map((locale) => (
          <SelectItem key={locale} value={locale} lang={locale}>
            {LOCALE_NAMES[locale]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
