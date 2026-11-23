"use client"

import { useState, useEffect, useCallback } from "react"
import { SparklesIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { connectApi, type CelebrationItem } from "@/lib/connect-api"
import { getImageUrl } from "@/lib/images"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

const EMOJIS = ["🎉", "🎂", "👏", "❤️"]

export function CelebrationsBanner() {
  const t = useTranslations("connect.celebrations")
  const [birthdays, setBirthdays] = useState<CelebrationItem[]>([])
  const [anniversaries, setAnniversaries] = useState<CelebrationItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [reactingId, setReactingId] = useState<string | null>(null)

  const fetchCelebrations = useCallback(async () => {
    setIsLoading(true)
    try {
      const result = await connectApi.getTodayCelebrations()
      setBirthdays(result.data.birthdays)
      setAnniversaries(result.data.anniversaries)
    } catch {
      // silently fail — section hides if empty
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    // Schedule the initial fetch out of the effect body to satisfy
    // set-state-in-effect.
    queueMicrotask(() => {
      void fetchCelebrations()
    })
  }, [fetchCelebrations])

  const handleReact = useCallback(
    async (item: CelebrationItem, emoji: string) => {
      setReactingId(`${item.id}:${item.type}`)
      try {
        const result = await connectApi.toggleReaction({
          targetUserId: item.id,
          type: item.type,
          emoji: item.reacted && item.reaction === emoji ? emoji : emoji,
        })

        // Update local state
        const update = (items: CelebrationItem[]) =>
          items.map((i) =>
            i.id === item.id && i.type === item.type
              ? {
                  ...i,
                  reacted: result.data.reacted,
                  reaction: result.data.emoji,
                }
              : i
          )

        setBirthdays((prev) => update(prev))
        setAnniversaries((prev) => update(prev))
      } catch {
        toast.error(t("reactFailed"))
      } finally {
        setReactingId(null)
      }
    },
    [t]
  )

  const hasCelebrations = birthdays.length > 0 || anniversaries.length > 0

  if (isLoading || !hasCelebrations) return null

  const allItems = [
    ...birthdays.map((b) => ({
      ...b,
      label: t("birthday", { name: b.firstName, age: b.age ?? 0 }),
    })),
    ...anniversaries.map((a) => ({
      ...a,
      label: t("anniversary", { name: a.firstName, years: a.years ?? 0 }),
    })),
  ]

  return (
    <>
      <div className="rounded-xl border bg-gradient-to-r from-primary/5 via-primary/[0.02] to-transparent p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
          <SparklesIcon className="size-4 text-primary" />
          <span>{t("title")}</span>
        </div>
        <div className="flex flex-col gap-3">
          {allItems.map((item) => (
            <div
              key={`${item.id}:${item.type}`}
              className="flex items-center gap-3"
            >
              <Avatar className="size-9 shrink-0">
                {item.avatarUrl && (
                  <AvatarImage
                    src={getImageUrl(item.avatarUrl) || undefined}
                    alt={`${item.firstName} ${item.lastName}`}
                  />
                )}
                <AvatarFallback className="text-xs">
                  {item.firstName[0]}
                  {item.lastName[0]}
                </AvatarFallback>
              </Avatar>
              <p className="flex-1 text-sm">{item.label}</p>
              <div className="flex items-center gap-0.5">
                {EMOJIS.map((emoji) => {
                  const isActive = item.reacted && item.reaction === emoji
                  const isLoading = reactingId === `${item.id}:${item.type}`

                  return (
                    <Button
                      key={emoji}
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className={cn(
                        "text-base transition-all",
                        isActive
                          ? "scale-110 bg-primary/10"
                          : "opacity-50 hover:opacity-100"
                      )}
                      onClick={() => handleReact(item, emoji)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <Loader2Icon className="size-3 animate-spin" />
                      ) : (
                        emoji
                      )}
                    </Button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Separator />
    </>
  )
}
