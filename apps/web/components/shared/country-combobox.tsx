"use client"

import {
  Combobox,
  ComboboxCollection,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxSeparator,
} from "@/components/ui/combobox"
import { countryGroups } from "@/lib/countries"
import { useTranslations } from "next-intl"

export function CountryCombobox({
  value,
  onValueChange,
  className,
}: {
  value: string
  onValueChange: (value: string) => void
  className?: string
}) {
  const t = useTranslations("shared.countries")
  return (
    <Combobox
      items={countryGroups}
      value={value}
      onValueChange={(v) => onValueChange(v ?? "")}
    >
      <ComboboxInput className={className} placeholder={t("placeholder")} />
      <ComboboxContent>
        <ComboboxEmpty>{t("empty")}</ComboboxEmpty>
        <ComboboxList>
          {(group: (typeof countryGroups)[number], index: number) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{t(group.value)}</ComboboxLabel>
              <ComboboxCollection>
                {(item) => (
                  <ComboboxItem key={item} value={item}>
                    {item}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
              {index < countryGroups.length - 1 && <ComboboxSeparator />}
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
