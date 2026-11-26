"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from "next-intl"

import { connectApi, type Liker } from "@/lib/connect-api"
import { getImageUrl } from "@/lib/images"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { reactionLabel } from "@/components/connect/reactions"

interface ReactionAvatarsProps {
  postId: string
  likesCount: number
  recentLikers: Liker[]
}

export function ReactionAvatars({
  postId,
  likesCount,
  recentLikers,
}: ReactionAvatarsProps) {
  const t = useTranslations("connect.reactions")
  const [showList, setShowList] = useState(false)

  if (likesCount === 0) return null

  const label = reactionLabel(likesCount, recentLikers)

  return (
    <>
      <button
        type="button"
        onClick={() => setShowList(true)}
        className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {recentLikers.length > 0 && (
          <span className="flex -space-x-1.5">
            {recentLikers.map((liker) => (
              <Avatar
                key={liker.id}
                className="size-5 border-2 border-background"
              >
                {liker.avatarUrl && (
                  <AvatarImage
                    src={getImageUrl(liker.avatarUrl) || undefined}
                    alt={`${liker.firstName} ${liker.lastName}`}
                  />
                )}
                <AvatarFallback className="text-3xs">
                  {liker.firstName?.[0]}
                </AvatarFallback>
              </Avatar>
            ))}
          </span>
        )}
        <span>{t(label.key, label.values)}</span>
      </button>

      <Dialog open={showList} onOpenChange={setShowList}>
        <DialogContent className="flex flex-col overflow-hidden sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("title", { count: likesCount })}</DialogTitle>
            <DialogDescription className="sr-only">
              {t("description")}
            </DialogDescription>
          </DialogHeader>
          <LikersList postId={postId} />
        </DialogContent>
      </Dialog>
    </>
  )
}

type ListState = {
  people: Liker[]
  cursor?: string
  status: "loading" | "loadingMore" | "ready" | "error"
}

/** Everyone who liked the post, a page at a time. Mounted only while the dialog is open, so it always reads fresh. */
function LikersList({ postId }: { postId: string }) {
  const t = useTranslations("connect.reactions")
  const tc = useTranslations("common")
  const [state, setState] = useState<ListState>({
    people: [],
    status: "loading",
  })

  const load = useCallback(
    async (cursor?: string) => {
      setState((s) => ({ ...s, status: cursor ? "loadingMore" : "loading" }))
      try {
        const res = await connectApi.getLikes(postId, cursor)
        setState((s) => ({
          people: cursor ? [...s.people, ...res.data] : res.data,
          cursor: res.meta.cursor,
          status: "ready",
        }))
      } catch {
        setState((s) => ({ ...s, status: "error" }))
      }
    },
    [postId]
  )

  useEffect(() => {
    Promise.resolve().then(() => load())
  }, [load])

  return (
    <div className="flex max-h-[400px] min-h-0 flex-col gap-3 overflow-y-auto">
      {state.status === "loading" &&
        Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}

      {state.people.map((liker) => (
        <div key={liker.id} className="flex items-center gap-3">
          <Avatar className="size-8">
            {liker.avatarUrl && (
              <AvatarImage
                src={getImageUrl(liker.avatarUrl) || undefined}
                alt={`${liker.firstName} ${liker.lastName}`}
              />
            )}
            <AvatarFallback className="text-xs">
              {liker.firstName?.[0]}
              {liker.lastName?.[0]}
            </AvatarFallback>
          </Avatar>
          <p className="text-sm font-medium">
            {liker.firstName} {liker.lastName}
          </p>
        </div>
      ))}

      {state.status === "error" && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{t("loadFailed")}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => load(state.cursor)}
          >
            {tc("retry")}
          </Button>
        </div>
      )}

      {state.cursor && state.status !== "error" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={state.status === "loadingMore"}
          aria-busy={state.status === "loadingMore"}
          onClick={() => load(state.cursor)}
        >
          {state.status === "loadingMore" && (
            <Spinner data-icon="inline-start" />
          )}
          {t("showMore")}
        </Button>
      )}
    </div>
  )
}
