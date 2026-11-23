"use client"

import { useMemo, useState } from "react"
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { EMOJI_PRESETS } from "@/lib/emoji-presets"
import { SPACE_ICONS } from "@/lib/space-icons"
import { useTranslations } from "next-intl"

/** The icon of a space, page or course: a lucide preset, or an emoji when `iconType` is EMOJI. */
export interface IconValue {
  iconType: "LUCIDE" | "EMOJI"
  icon: string
  emoji: string | null
}

interface EntityIconPickerProps {
  current: IconValue
  onChange: (next: IconValue) => void
  onRemove: () => void
  /** Render as a button trigger. Defaults to an inline icon button. */
  children?: React.ReactNode
  /** Disable the trigger (e.g. when the user is not an editor). */
  disabled?: boolean
}

export function EntityIconPicker({
  current,
  onChange,
  onRemove,
  children,
  disabled,
}: EntityIconPickerProps) {
  const t = useTranslations("shared.iconPicker")
  const hasIcon = current.iconType === "LUCIDE" || current.iconType === "EMOJI"

  return (
    <Popover>
      <PopoverTrigger asChild>
        {children ?? (
          <button
            type="button"
            disabled={disabled}
            aria-label={t("change")}
            className="group/icon relative flex size-16 items-center justify-center rounded-md transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon
              className="absolute inset-0 m-auto size-5 text-muted-foreground opacity-0 transition-opacity group-hover/icon:opacity-100"
              aria-hidden
            />
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
        align="start"
        sideOffset={8}
        collisionPadding={16}
      >
        <Tabs defaultValue="icons" className="w-full">
          <TabsList className="w-full rounded-b-none">
            <TabsTrigger value="icons" className="flex-1">
              {t("icons")}
            </TabsTrigger>
            <TabsTrigger value="emoji" className="flex-1">
              {t("emoji")}
            </TabsTrigger>
            <TabsTrigger value="custom" className="flex-1">
              {t("custom")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="icons" className="m-0 p-0">
            <Command>
              <CommandInput
                placeholder={t("searchIcons")}
                aria-label={t("searchIcons")}
              />
              <CommandList className="max-h-72">
                <CommandEmpty>{t("noIcons")}</CommandEmpty>
                <CommandGroup className="[&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-6 [&_[cmdk-group-items]]:gap-1">
                  {SPACE_ICONS.map(({ value, Icon, keywords }) => (
                    <CommandItem
                      key={value}
                      value={value}
                      keywords={[keywords, t(`names.${value}`)]}
                      aria-label={t("icon", { name: t(`names.${value}`) })}
                      title={t(`names.${value}`)}
                      data-checked={
                        current.iconType === "LUCIDE" && current.icon === value
                      }
                      className="size-12 justify-center p-0 data-[checked=true]:bg-accent data-[checked=true]:ring-1 data-[checked=true]:ring-primary data-[checked=true]:ring-inset [&>svg:last-child]:hidden"
                      onSelect={() =>
                        onChange({
                          iconType: "LUCIDE",
                          icon: value,
                          emoji: null,
                        })
                      }
                    >
                      <Icon className="size-6" strokeWidth={1.75} />
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </TabsContent>

          <TabsContent value="emoji" className="m-0 p-0">
            <Command className="border-0">
              <CommandInput
                placeholder={t("searchEmoji")}
                aria-label={t("searchEmoji")}
              />
              <CommandList className="max-h-64">
                <CommandEmpty>{t("noEmoji")}</CommandEmpty>
                <CommandGroup>
                  {EMOJI_PRESETS.map((e) => {
                    const isActive =
                      current.iconType === "EMOJI" && current.emoji === e.char
                    return (
                      <CommandItem
                        key={`${e.char}-${e.name}`}
                        value={`${e.name} ${e.keywords?.join(" ") ?? ""}`}
                        onSelect={() =>
                          onChange({
                            iconType: "EMOJI",
                            icon: "book-open",
                            emoji: e.char,
                          })
                        }
                        className="flex items-center gap-2"
                      >
                        <span className="text-xl leading-none">{e.char}</span>
                        <span className="text-sm">{e.name}</span>
                        {isActive && (
                          <span className="ml-auto text-xs text-muted-foreground">
                            ✓
                          </span>
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
          </TabsContent>

          <TabsContent value="custom" className="m-0 p-3">
            <CustomEmojiForm
              initial={current.emoji ?? ""}
              onSubmit={(value) =>
                onChange({ iconType: "EMOJI", icon: "book-open", emoji: value })
              }
            />
          </TabsContent>
        </Tabs>

        {hasIcon && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={onRemove}
            >
              <Trash2Icon data-icon="inline-start" />
              {t("remove")}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

function CustomEmojiForm({
  initial,
  onSubmit,
}: {
  initial: string
  onSubmit: (value: string) => void
}) {
  const t = useTranslations("shared.iconPicker")
  const [value, setValue] = useState(initial)

  const canSubmit = useMemo(
    () => value.trim().length > 0 && value.length <= 10,
    [value]
  )

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        e.stopPropagation()
        if (canSubmit) onSubmit(value.trim())
      }}
      className="flex flex-col gap-2"
    >
      <p className="text-xs text-muted-foreground">{t("customHint")}</p>
      <div className="relative">
        <SearchIcon
          className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          autoFocus
          maxLength={10}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={t("customPlaceholder")}
          className="pl-8"
        />
      </div>
      <Button type="submit" size="sm" disabled={!canSubmit}>
        {t("use")}
      </Button>
    </form>
  )
}
