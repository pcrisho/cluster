"use client"

import { useMemo, useCallback } from "react"
import { Input } from "@/components/ui/input"
import { CountryCombobox } from "@/components/shared/country-combobox"
import {
  countries,
  dialByCode,
  codeByLabel,
  getCountryCompact,
  countryByCode,
  defaultCountryLabel,
} from "@/lib/countries"
import { useTranslations } from "next-intl"

function parseFullPhone(
  fullPhone: string,
  defaultLabel: string
): { countryLabel: string; localNumber: string } {
  if (!fullPhone || !fullPhone.trim()) {
    return { countryLabel: defaultLabel, localNumber: "" }
  }

  const sorted = [...countries].sort((a, b) => b.dial.length - a.dial.length)

  for (const c of sorted) {
    if (fullPhone.startsWith(c.dial)) {
      const rest = fullPhone.slice(c.dial.length).trim()
      return { countryLabel: getCountryCompact(c), localNumber: rest }
    }
  }

  return { countryLabel: defaultLabel, localNumber: fullPhone.trim() }
}

interface PhoneInputProps {
  value: string
  onChange: (value: string) => void
  defaultCountry?: string
  className?: string
  /** Given to the number field, so a `<label htmlFor>` names it. */
  id?: string
}

export function PhoneInput({
  value,
  onChange,
  defaultCountry,
  className,
  id,
}: PhoneInputProps) {
  const t = useTranslations("shared.phone")
  const initLabel = defaultCountry
    ? getCountryCompact(countryByCode[defaultCountry] ?? countries[0]!)
    : defaultCountryLabel()

  const { countryLabel, localNumber } = useMemo(
    () => parseFullPhone(value, initLabel),
    [value, initLabel]
  )

  const handleCountryChange = useCallback(
    (label: string) => {
      const code = codeByLabel[label]
      const dial = code ? (dialByCode[code] ?? "") : ""
      const full = localNumber ? `${dial} ${localNumber}` : dial
      onChange(full)
    },
    [localNumber, onChange]
  )

  const handleNumberChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      const code = codeByLabel[countryLabel]
      const dial = code ? (dialByCode[code] ?? "") : ""
      const full = raw ? `${dial} ${raw}` : dial
      onChange(full)
    },
    [countryLabel, onChange]
  )

  return (
    <div className={className}>
      <div className="flex gap-2">
        <CountryCombobox
          value={countryLabel}
          onValueChange={handleCountryChange}
          className="w-[140px] shrink-0"
        />
        <Input
          id={id}
          type="tel"
          value={localNumber}
          onChange={handleNumberChange}
          placeholder={t("placeholder")}
          autoComplete="tel"
          className="flex-1"
        />
      </div>
    </div>
  )
}
