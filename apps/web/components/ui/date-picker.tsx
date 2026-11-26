"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { useDateFnsLocale } from "@/lib/i18n/date-fns-locale"

export function DatePicker({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}) {
  const dateLocale = useDateFnsLocale()
  const t = useTranslations("ui")
  const date = value ? new Date(value) : undefined

  function handleSelect(selected: Date | undefined) {
    if (selected) {
      // Set time to end of day (23:59:59)
      const endOfDay = new Date(selected)
      endOfDay.setHours(23, 59, 59, 999)
      onChange(endOfDay.toISOString())
    } else {
      onChange("")
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-8 justify-start px-2.5 text-xs font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon data-icon="inline-start" />
          {date ? (
            format(date, "PP", { locale: dateLocale })
          ) : (
            <span>{placeholder ?? t("pickDate")}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={handleSelect}
          disabled={(d) => {
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            return d < today
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
