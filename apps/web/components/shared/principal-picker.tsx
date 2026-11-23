"use client"

import { useEffect, useState } from "react"
import { BriefcaseIcon, NetworkIcon, UserIcon } from "lucide-react"

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { orgApi, type Principal, type PrincipalType } from "@/lib/org-api"
import { useDebounce } from "@/hooks/use-debounce"
import { useTranslations } from "next-intl"

export const PRINCIPAL_ICON = {
  USER: UserIcon,
  ORG_NODE: NetworkIcon,
  POSITION: BriefcaseIcon,
} as const

/** Result groups, in this order; each type's heading is `shared.principals.<type>`. */
const GROUPS: PrincipalType[] = ["USER", "ORG_NODE", "POSITION"]

interface PrincipalPickerProps {
  /** Principals that already have an entry; shown as taken. */
  taken: Set<string>
  /** Shown next to a taken principal. */
  takenLabel?: string
  onPick: (principal: Principal) => void
  /** Limit the search to these kinds (default: all three). */
  types?: PrincipalType[]
  placeholder?: string
}

/** One search box for people, areas and positions. */
export function PrincipalPicker({
  taken,
  takenLabel,
  onPick,
  types = GROUPS,
  placeholder,
}: PrincipalPickerProps) {
  const t = useTranslations("shared.principals")
  const [text, setText] = useState("")
  const debounced = useDebounce(text, 200)
  const [results, setResults] = useState<Principal[]>([])

  useEffect(() => {
    let cancelled = false
    orgApi
      .searchPrincipals(debounced)
      .then((found) => !cancelled && setResults(found))
      .catch(() => !cancelled && setResults([]))
    return () => {
      cancelled = true
    }
  }, [debounced])

  return (
    <Command shouldFilter={false} className="rounded-lg border">
      <CommandInput
        value={text}
        onValueChange={setText}
        placeholder={placeholder ?? t("placeholder")}
      />
      <CommandList className="max-h-56">
        <CommandEmpty>{t("noMatch", { query: text })}</CommandEmpty>
        {GROUPS.filter((g) => types.includes(g)).map((type) => {
          const items = results.filter((r) => r.type === type)
          if (items.length === 0) return null
          const Icon = PRINCIPAL_ICON[type]
          return (
            <CommandGroup key={type} heading={t(type)}>
              {items.map((p) => {
                const isTaken = taken.has(`${p.type}:${p.id}`)
                return (
                  <CommandItem
                    key={`${p.type}:${p.id}`}
                    value={`${p.type}:${p.id}`}
                    disabled={isTaken}
                    onSelect={() => onPick(p)}
                  >
                    <Icon className="size-4 text-muted-foreground" />
                    <span className="truncate">{p.name}</span>
                    {(p.detail || p.type === "ORG_NODE") && (
                      <span className="truncate text-xs text-muted-foreground">
                        {p.type === "ORG_NODE"
                          ? p.main
                            ? t("mainNode")
                            : t("area")
                          : p.detail}
                      </span>
                    )}
                    {isTaken && (
                      <span className="ml-auto text-xs text-muted-foreground">
                        {takenLabel ?? t("hasAccess")}
                      </span>
                    )}
                  </CommandItem>
                )
              })}
            </CommandGroup>
          )
        })}
      </CommandList>
    </Command>
  )
}
