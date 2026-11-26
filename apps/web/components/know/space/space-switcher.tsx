"use client"

import { useState } from "react"
import Link from "next/link"
import { ChevronsUpDownIcon, LayoutGridIcon, LockIcon } from "lucide-react"

import { knowApi, type Space } from "@/lib/know-api"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { useTranslations } from "next-intl"

/** The current space, and a menu to jump to another one. */
export function SpaceSwitcher({ space }: { space: Space }) {
  const t = useTranslations("know.space")
  const [spaces, setSpaces] = useState<Space[] | null>(null)

  const load = (open: boolean) => {
    if (open && spaces === null) {
      knowApi
        .getSpaces()
        .then((res) => setSpaces(res.data))
        .catch(() => setSpaces([]))
    }
  }

  return (
    <DropdownMenu onOpenChange={load}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-9 w-full justify-start gap-2 px-2">
          <EntityGlyph
            iconType={space.iconType}
            icon={space.icon}
            emoji={space.emoji}
            fallback="book-open"
            size="md"
            className="shrink-0"
          />
          <span className="truncate font-medium">{space.name}</span>
          <ChevronsUpDownIcon className="ml-auto text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("spaces")}</DropdownMenuLabel>
        {spaces === null ? (
          <div className="flex flex-col gap-1 p-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : (
          spaces.map((s) => (
            <DropdownMenuItem key={s.id} asChild>
              <Link href={`/know/spaces/${s.id}`}>
                <EntityGlyph
                  iconType={s.iconType}
                  icon={s.icon}
                  emoji={s.emoji}
                  fallback="book-open"
                />
                <span className="truncate">{s.name}</span>
                {s.restricted && (
                  <LockIcon className="ml-auto text-muted-foreground" aria-label={t("restricted")} />
                )}
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/know">
            <LayoutGridIcon />
            {t("allSpaces")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
