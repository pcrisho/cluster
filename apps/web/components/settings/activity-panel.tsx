"use client"

import { useCallback, useEffect, useState } from "react"
import { HistoryIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { adminApi, type ActivityEntry } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"
import { useDates } from "@/lib/i18n/use-dates"
import { getImageUrl } from "@/lib/images"

/** The organization's audit log, newest first, twenty at a time. */
export function ActivityPanel() {
  const t = useTranslations("settings.activity")
  const ta = useTranslations("settings.activity.actions")
  const dates = useDates()
  const [items, setItems] = useState<ActivityEntry[] | null>(null)
  const [next, setNext] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(
    async (cursor?: string) => {
      setLoading(true)
      try {
        const page = await adminApi.listActivity(cursor)
        setItems((current) => [
          ...(cursor ? (current ?? []) : []),
          ...page.items,
        ])
        setNext(page.nextCursor)
      } catch (err) {
        toast.error(getErrorMessage(err) || t("loadFailed"))
        setItems((current) => current ?? [])
      } finally {
        setLoading(false)
      }
    },
    [t]
  )

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  if (!items) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HistoryIcon />
          </EmptyMedia>
          <EmptyTitle>{t("empty")}</EmptyTitle>
          <EmptyDescription>{t("emptyBody")}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="divide-y rounded-xl border">
        {items.map((entry) => {
          const [entity, verb] = entry.action.split(".")
          const key = `${entity}.${verb}`
          const name = `${entry.actor.firstName} ${entry.actor.lastName}`
          return (
            <li
              key={entry.id}
              className="flex items-start gap-3 p-3 sm:items-center"
            >
              <Avatar className="size-8">
                <AvatarImage
                  src={getImageUrl(entry.actor.avatarUrl) ?? undefined}
                  alt=""
                />
                <AvatarFallback>
                  {entry.actor.firstName[0]}
                  {entry.actor.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
                <p className="min-w-0 flex-1 text-sm">
                  <span className="font-medium">{name}</span>{" "}
                  {ta.has(key as never) ? ta(key as never) : t("unknown")}
                </p>
                <time
                  dateTime={entry.createdAt}
                  title={dates.instant(entry.createdAt, "dateTime")}
                  className="shrink-0 text-xs text-muted-foreground"
                >
                  {dates.relative(entry.createdAt)}
                </time>
              </div>
            </li>
          )
        })}
      </ul>
      {next && (
        <Button
          variant="outline"
          className="self-center"
          onClick={() => void load(next)}
          disabled={loading}
        >
          {loading && <Spinner data-icon="inline-start" />}
          {t("more")}
        </Button>
      )}
    </div>
  )
}
