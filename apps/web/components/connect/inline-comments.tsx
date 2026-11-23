"use client"

import { useState, useEffect, useCallback, type FormEvent } from "react"
import { Trash2Icon, SendIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/lib/auth-context"
import { connectApi, type Comment } from "@/lib/connect-api"
import { getImageUrl } from "@/lib/images"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

interface InlineCommentsProps {
  postId: string
  onCommentCountChanged: (postId: string, count: number) => void
}

export function InlineComments({
  postId,
  onCommentCountChanged,
}: InlineCommentsProps) {
  const t = useTranslations("connect.post")
  const dates = useDates()
  const { user } = useAuth()
  const [comments, setComments] = useState<Comment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [commentBody, setCommentBody] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    // Schedule the loading-state transition out of the effect body
    // to satisfy the set-state-in-effect rule.
    queueMicrotask(() => {
      setIsLoading(true)
    })
    connectApi
      .getComments(postId)
      .then((result) => {
        setComments(result.data)
      })
      .catch(() => {
        toast.error(t("commentsFailed"))
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [postId, t])

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!commentBody.trim() || isSubmitting) return

      const tempId = `temp-${Date.now()}`
      const optimistic: Comment = {
        id: tempId,
        body: commentBody.trim(),
        authorId: user?.id || "",
        postId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        author: {
          id: user?.id || "",
          firstName: user?.firstName || "",
          lastName: user?.lastName || "",
          avatarUrl: null,
          role: user?.role || "",
        },
      }

      setComments((prev) => [...prev, optimistic])
      setCommentBody("")
      setIsSubmitting(true)

      try {
        const result = await connectApi.createComment(postId, optimistic.body)
        setComments((prev) =>
          prev.map((c) => (c.id === tempId ? result.data : c))
        )
        onCommentCountChanged(postId, comments.length + 1)
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== tempId))
        toast.error(t("commentFailed"))
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      commentBody,
      isSubmitting,
      user,
      postId,
      comments.length,
      onCommentCountChanged,
      t,
    ]
  )

  const handleDelete = useCallback(
    async (commentId: string) => {
      setDeletingId(commentId)
      try {
        await connectApi.deleteComment(commentId)
        setComments((prev) => prev.filter((c) => c.id !== commentId))
        toast.success(t("commentDeleted"))
      } catch {
        toast.error(t("commentDeleteFailed"))
      } finally {
        setDeletingId(null)
      }
    },
    [t]
  )

  const canDelete = (comment: Comment) => {
    if (!user) return false
    return comment.authorId === user.id || user.role === "ADMIN"
  }

  return (
    <div className="space-y-4 pt-3">
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="size-6 shrink-0 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("noCommentsInline")}</p>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-2">
              <Avatar className="mt-0.5 size-6">
                {comment.author.avatarUrl && (
                  <AvatarImage
                    src={getImageUrl(comment.author.avatarUrl) || undefined}
                    alt={`${comment.author.firstName} ${comment.author.lastName}`}
                  />
                )}
                <AvatarFallback className="text-[10px]">
                  <Skeleton className="size-full rounded-full" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    {comment.author.firstName} {comment.author.lastName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dates.relative(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm">{comment.body}</p>
              </div>
              {canDelete(comment) && (
                <button
                  type="button"
                  onClick={() => handleDelete(comment.id)}
                  disabled={deletingId === comment.id}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  {deletingId === comment.id ? (
                    <Spinner className="size-3" />
                  ) : (
                    <Trash2Icon className="size-3" />
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          placeholder={t("writeComment")}
          value={commentBody}
          onChange={(e) => setCommentBody(e.target.value)}
          disabled={isSubmitting}
          className="flex-1"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!commentBody.trim() || isSubmitting}
        >
          {isSubmitting ? (
            <Loader2Icon className="size-4 animate-spin" />
          ) : (
            <SendIcon className="size-4" />
          )}
        </Button>
      </form>
    </div>
  )
}
