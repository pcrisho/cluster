"use client"

import Link from "next/link"
import { LockIcon } from "lucide-react"

import { useAuth } from "@/lib/auth-context"
import type { Space } from "@/lib/know-api"
import { extractPlainTextFromContent } from "@/lib/rich-text/content"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

export function SpaceCard({ space }: { space: Space }) {
  const t = useTranslations("know.home")
  const dates = useDates()
  const { user } = useAuth()
  const isolated = user?.organization.isolated ?? false
  const pageCount = space._count?.pages ?? 0
  const description = space.descriptionContent
    ? extractPlainTextFromContent(space.descriptionContent)
    : ""

  return (
    <Link
      href={`/know/spaces/${space.id}`}
      className="group block rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Card className="h-full transition-colors group-hover:bg-muted/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <EntityGlyph
              iconType={space.iconType}
              icon={space.icon}
              emoji={space.emoji}
              fallback="book-open"
              size="md"
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate">{space.name}</span>
            {space.restricted && (
              <LockIcon
                className="ml-auto size-3.5 shrink-0 text-muted-foreground"
                aria-label={t("restricted")}
              />
            )}
          </CardTitle>
          {description && (
            <CardDescription className="line-clamp-2">
              {description}
            </CardDescription>
          )}
        </CardHeader>
        <CardFooter className="mt-auto gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">{t("pages", { count: pageCount })}</Badge>
          <span>{t("updated", { when: dates.relative(space.updatedAt) })}</span>
          {isolated && !space.restricted && (
            <span>{t("visibleToEveryMainNode")}</span>
          )}
        </CardFooter>
      </Card>
    </Link>
  )
}
