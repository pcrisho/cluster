"use client"

import { useState, useCallback, useRef, type FormEvent } from "react"
import {
  HeartIcon,
  MessageSquareIcon,
  SendIcon,
  MoreHorizontalIcon,
  PencilIcon,
  Trash2Icon,
  Loader2Icon,
} from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"

import { useAuth } from "@/lib/auth-context"
import {
  connectApi,
  type Liker,
  type Post,
  type Comment,
} from "@/lib/connect-api"
import { getImageUrl } from "@/lib/images"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { PostBody } from "@/components/connect/post-body"
import { PostAudienceBadge } from "@/components/connect/post-audience-badge"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

interface PostDetailDialogProps {
  post: Post
  onLikeToggled: (
    postId: string,
    liked: boolean,
    likesCount: number,
    recentLikers: Liker[]
  ) => void
  onCommentCountChanged: (postId: string, count: number) => void
  children?: React.ReactNode
}

export function PostDetailDialog({
  post,
  onLikeToggled,
  onCommentCountChanged,
  children,
}: PostDetailDialogProps) {
  const t = useTranslations("connect.post")
  const dates = useDates()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentBody, setCommentBody] = useState("")
  const [isSubmittingComment, setIsSubmittingComment] = useState(false)
  const [isLoadingComments, setIsLoadingComments] = useState(false)
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(
    null
  )
  const [liked, setLiked] = useState(post.likedByMe)
  const [likesCount, setLikesCount] = useState(post._count.likes)
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const hasFetchedRef = useRef(false)

  const hasImages = post.images && post.images.length > 0

  const handleLikeToggle = useCallback(async () => {
    const previousLiked = liked
    const previousCount = likesCount

    setLiked(!liked)
    setLikesCount(liked ? likesCount - 1 : likesCount + 1)

    try {
      const result = await connectApi.toggleLike(post.id)
      setLiked(result.data.liked)
      setLikesCount(result.data.likesCount)
      onLikeToggled(
        post.id,
        result.data.liked,
        result.data.likesCount,
        result.data.recentLikers
      )
    } catch {
      setLiked(previousLiked)
      setLikesCount(previousCount)
      toast.error(t("likeFailed"))
    }
  }, [liked, likesCount, post.id, onLikeToggled, t])

  const fetchComments = useCallback(async () => {
    setIsLoadingComments(true)
    try {
      const result = await connectApi.getComments(post.id)
      setComments(result.data)
    } catch {
      toast.error(t("commentsFailed"))
    } finally {
      setIsLoadingComments(false)
    }
  }, [post.id, t])

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen)
      if (newOpen && !hasFetchedRef.current) {
        hasFetchedRef.current = true
        fetchComments()
      }
    },
    [fetchComments]
  )

  const handleSubmitComment = useCallback(
    async (e: FormEvent) => {
      e.preventDefault()
      if (!commentBody.trim() || isSubmittingComment) return

      const tempId = `temp-${Date.now()}`
      const optimisticComment: Comment = {
        id: tempId,
        body: commentBody.trim(),
        authorId: user?.id || "",
        postId: post.id,
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

      setComments((prev) => [...prev, optimisticComment])
      setCommentBody("")
      setIsSubmittingComment(true)

      try {
        const result = await connectApi.createComment(
          post.id,
          optimisticComment.body
        )
        setComments((prev) => {
          const updated = prev.map((c) => (c.id === tempId ? result.data : c))
          onCommentCountChanged(post.id, updated.length)
          return updated
        })
      } catch {
        setComments((prev) => prev.filter((c) => c.id !== tempId))
        toast.error(t("commentFailed"))
      } finally {
        setIsSubmittingComment(false)
      }
    },
    [commentBody, isSubmittingComment, user, post.id, onCommentCountChanged, t]
  )

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      setDeletingCommentId(commentId)
      try {
        await connectApi.deleteComment(commentId)
        setComments((prev) => {
          const updated = prev.filter((c) => c.id !== commentId)
          onCommentCountChanged(post.id, updated.length)
          return updated
        })
        toast.success(t("commentDeleted"))
      } catch {
        toast.error(t("commentDeleteFailed"))
      } finally {
        setDeletingCommentId(null)
      }
    },
    [post.id, onCommentCountChanged, t]
  )

  const canDeleteComment = (comment: Comment) => {
    if (!user) return false
    return comment.authorId === user.id || user.role === "ADMIN"
  }

  const canEditComment = (comment: Comment) => {
    if (!user) return false
    return comment.authorId === user.id
  }

  // Without images the inline feed view is sufficient — no modal needed
  if (!hasImages) {
    return <>{children}</>
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="flex h-[90dvh] max-h-[800px] w-full flex-col gap-0 overflow-y-auto border-none p-0 shadow-xl duration-200 md:h-[75dvh] md:max-w-4xl md:flex-row md:overflow-hidden lg:max-w-5xl">
        <DialogTitle className="sr-only">{t("detailsTitle")}</DialogTitle>
        <DialogDescription className="sr-only">
          {t("detailsDescription")}
        </DialogDescription>

        {/* Image Gallery */}
        <div className="relative flex h-[45vh] w-full shrink-0 flex-col items-center justify-center overflow-hidden bg-zinc-950 select-none md:h-full md:flex-1">
          <div
            className="pointer-events-none absolute inset-0 scale-105 bg-cover bg-center opacity-25 blur-2xl filter select-none"
            style={{
              backgroundImage: `url(${getImageUrl(post.images[activeImageIndex])})`,
            }}
          />
          <div className="relative z-10 flex w-full flex-1 items-center justify-center p-6">
            {post.images[activeImageIndex] && (
              <Image
                src={getImageUrl(post.images[activeImageIndex]) ?? ""}
                alt={t("image", {
                  title: post.title ?? t("imageFallback"),
                  index: activeImageIndex + 1,
                })}
                fill
                unoptimized
                className="rounded-md object-contain shadow-2xl"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            )}
          </div>
          {post.images.length > 1 && (
            <div className="z-10 flex w-full shrink-0 justify-center gap-2 overflow-x-auto border-t border-white/5 bg-zinc-900/60 p-3 backdrop-blur-md">
              {post.images.map((url, i) => (
                <Button
                  key={url}
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setActiveImageIndex(i)}
                  className={cn(
                    "size-12 shrink-0 overflow-hidden rounded-lg border-2 p-0 transition-all duration-200",
                    activeImageIndex === i
                      ? "scale-105 border-primary opacity-100"
                      : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <Image
                    src={getImageUrl(url) ?? ""}
                    alt={t("thumbnail", { index: i + 1 })}
                    width={48}
                    height={48}
                    unoptimized
                    className="size-full rounded-[7px] object-cover"
                  />
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Details & Comments Section */}
        <div className="flex h-full w-full shrink-0 flex-col border-t bg-background md:w-[380px] md:border-t-0 md:border-l lg:w-[420px]">
          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border bg-background/50 p-4 backdrop-blur-md">
            <Avatar className="size-8 shrink-0">
              {post.author.avatarUrl && (
                <AvatarImage
                  src={getImageUrl(post.author.avatarUrl) || undefined}
                  alt={`${post.author.firstName} ${post.author.lastName}`}
                />
              )}
              <AvatarFallback className="text-xs">
                {post.author.firstName[0]}
                {post.author.lastName[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm leading-none font-semibold text-foreground">
                {post.author.firstName} {post.author.lastName}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {dates.relative(post.createdAt)}
              </p>
            </div>
          </div>

          {/* Scrollable Content & Comments List */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-muted/5 p-4">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-1.5 empty:hidden">
                <PostAudienceBadge post={post} />
              </div>
              <p className="text-base font-bold text-foreground">
                {post.title ?? t("post")}
              </p>

              <PostBody body={post.body} className="mt-2" />
            </div>

            <Separator />

            {/* Reactions Bar */}
            <div className="flex items-center gap-4 py-0.5">
              <button
                type="button"
                onClick={handleLikeToggle}
                className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <HeartIcon
                  className={cn(
                    "size-4 transition-all duration-200",
                    liked ? "scale-110 fill-red-500 text-red-500" : ""
                  )}
                />
                <span
                  className={cn("font-medium", liked ? "text-red-500" : "")}
                >
                  {likesCount}
                </span>
              </button>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MessageSquareIcon className="size-4" />
                <span className="font-medium">{comments.length}</span>
              </span>
            </div>

            <Separator />

            {/* Comments List */}
            <div className="flex min-h-[200px] flex-1 flex-col gap-3">
              <h4 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                {t("comments")}
              </h4>

              {isLoadingComments ? (
                <div className="flex flex-1 items-center justify-center py-8">
                  <Spinner className="text-muted-foreground" />
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center text-muted-foreground">
                  <MessageSquareIcon className="mb-2 opacity-20" />
                  <p className="text-sm">{t("noComments")}</p>
                  <p className="mt-0.5 text-xs opacity-60">{t("beFirst")}</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {comments.map((comment) => (
                    <div key={comment.id} className="flex items-start gap-2.5">
                      <Avatar className="mt-0.5 size-7 shrink-0">
                        {comment.author.avatarUrl && (
                          <AvatarImage
                            src={
                              getImageUrl(comment.author.avatarUrl) || undefined
                            }
                            alt={`${comment.author.firstName} ${comment.author.lastName}`}
                          />
                        )}
                        <AvatarFallback className="text-[10px]">
                          {comment.author.firstName[0]}
                          {comment.author.lastName[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1 rounded-xl bg-muted/40 p-3 text-sm">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-foreground">
                            {comment.author.firstName} {comment.author.lastName}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">
                              {dates.relative(comment.createdAt)}
                            </span>
                            {(canEditComment(comment) ||
                              canDeleteComment(comment)) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="size-5 p-0 text-muted-foreground hover:text-foreground"
                                    aria-label={t("commentActions")}
                                  >
                                    <MoreHorizontalIcon />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" sideOffset={4}>
                                  {canEditComment(comment) && (
                                    <DropdownMenuItem
                                      onClick={() => toast.info(t("editSoon"))}
                                    >
                                      <PencilIcon />
                                      {t("edit")}
                                    </DropdownMenuItem>
                                  )}
                                  {canDeleteComment(comment) && (
                                    <DropdownMenuItem
                                      onClick={() =>
                                        handleDeleteComment(comment.id)
                                      }
                                      disabled={
                                        deletingCommentId === comment.id
                                      }
                                      className="text-destructive focus:text-destructive"
                                    >
                                      {deletingCommentId === comment.id ? (
                                        <Spinner />
                                      ) : (
                                        <Trash2Icon />
                                      )}
                                      {t("delete")}
                                    </DropdownMenuItem>
                                  )}
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>
                        <p className="leading-normal break-words text-muted-foreground">
                          {comment.body}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comment Form */}
          <form
            onSubmit={handleSubmitComment}
            className="flex shrink-0 items-center gap-2 border-t border-border bg-background p-4"
          >
            <Input
              placeholder={t("writeComment")}
              value={commentBody}
              onChange={(e) => setCommentBody(e.target.value)}
              disabled={isSubmittingComment}
              className="flex-1 rounded-full border-muted bg-muted/50 focus-visible:ring-1 focus-visible:ring-primary/50"
            />
            <Button
              type="submit"
              size="icon"
              className="shrink-0 rounded-full"
              disabled={!commentBody.trim() || isSubmittingComment}
            >
              {isSubmittingComment ? (
                <Loader2Icon className="animate-spin" />
              ) : (
                <SendIcon />
              )}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
