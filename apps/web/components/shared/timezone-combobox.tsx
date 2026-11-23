"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"

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
import { timeZoneGroups, timeZoneLabel } from "@/lib/time-zone"

/** Every IANA zone the API accepts, by region, labelled with its current offset; the value is the zone id. */
export function TimezoneCombobox({
  id,
  value,
  onValueChange,
  disabled,
}: {
  id?: string
  value: string
  onValueChange: (value: string) => void
  disabled?: boolean
}) {
  const t = useTranslations("timeZonePicker")
  const groups = useMemo(() => timeZoneGroups(), [])
  const labels = useMemo(
    () =>
      new Map(
        groups
          .flatMap((g) => g.items)
          .map((zone) => [zone, timeZoneLabel(zone)])
      ),
    [groups]
  )
  const label = (zone: string) => labels.get(zone) ?? zone

  return (
    <Combobox
      items={groups}
      value={value}
      onValueChange={(v) => v && onValueChange(v)}
      itemToStringLabel={label}
      disabled={disabled}
    >
      <ComboboxInput id={id} placeholder={t("placeholder")} />
      <ComboboxContent>
        <ComboboxEmpty>{t("empty")}</ComboboxEmpty>
        <ComboboxList>
          {(group: { value: string; items: string[] }, index: number) => (
            <ComboboxGroup key={group.value} items={group.items}>
              <ComboboxLabel>{group.value}</ComboboxLabel>
              <ComboboxCollection>
                {(zone: string) => (
                  <ComboboxItem key={zone} value={zone}>
                    {label(zone)}
                  </ComboboxItem>
                )}
              </ComboboxCollection>
              {index < groups.length - 1 && <ComboboxSeparator />}
            </ComboboxGroup>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
