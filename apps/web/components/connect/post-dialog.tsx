"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { toast } from "sonner"

import { useAuth } from "@/lib/auth-context"
import { connectApi, type Post } from "@/lib/connect-api"
import { announcementSchema } from "@/lib/validations"
import {
  extractPlainTextFromContent,
  parseRichText,
} from "@/lib/rich-text/content"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getImageUrl } from "@/lib/images"
import { Spinner } from "@/components/ui/spinner"
import {
  PostComposerFields,
  type PostMode,
  type PendingAction,
} from "@/components/connect/post-composer-fields"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

export type PostType = "POST" | "ANNOUNCEMENT"

/** The body is a serialized TipTap document; it is empty when it has no visible text. */
function isBodyEmpty(body: string): boolean {
  return !extractPlainTextFromContent(parseRichText(body))
}

interface PostDialogProps {
  post?: Post
  onPostSaved: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  initialType?: PostType
  pendingAction?: PendingAction
  onPendingActionConsumed?: () => void
  children?: React.ReactNode
}

export function PostDialog({
  post,
  onPostSaved,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
  initialType,
  pendingAction = "none",
  onPendingActionConsumed,
  children,
}: PostDialogProps) {
  const tc = useTranslations("common")
  const t = useTranslations("connect.composer")
  const { user } = useAuth()
  const isEdit = !!post

  const [internalOpen, setInternalOpen] = useState(false)
  const open = controlledOpen ?? internalOpen
  const setOpen = controlledOnOpenChange ?? setInternalOpen

  const [title, setTitle] = useState(post?.title ?? "")
  const [body, setBody] = useState(post?.body ?? "")
  const [images, setImages] = useState<string[]>(post?.images ?? [])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPinned, setIsPinned] = useState(post?.isPinned ?? false)
  const [pinnedExpiresAt, setPinnedExpiresAt] = useState(
    post?.pinnedExpiresAt ?? ""
  )

  const canAnnounce = user?.role === "ADMIN" || user?.role === "MANAGER"

  const postMode: PostMode = isPinned
    ? "ANNOUNCEMENT"
    : isEdit
      ? post.title
        ? "ARTICLE"
        : "POST"
      : initialType === "ANNOUNCEMENT"
        ? "ANNOUNCEMENT"
        : "POST"

  const resetForm = useCallback(() => {
    if (isEdit && post) {
      setTitle(post.title ?? "")
      setBody(post.body)
      setImages(post.images)
      setIsPinned(post.isPinned)
      setPinnedExpiresAt(post.pinnedExpiresAt ?? "")
    } else {
      setTitle("")
      setBody("")
      setImages([])
      setIsPinned(false)
      setPinnedExpiresAt("")
    }
    setIsSubmitting(false)
  }, [isEdit, post])

  const prevOpenRef = useRef(open)
  useEffect(() => {
    const wasOpen = prevOpenRef.current
    if (!open && wasOpen) {
      resetForm()
    }
    if (open && !wasOpen && !isEdit && initialType) {
      setIsPinned(initialType === "ANNOUNCEMENT")
    }
    prevOpenRef.current = open
  }, [open, initialType, isEdit, resetForm])

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (isBodyEmpty(body)) {
        toast.error(t("bodyRequired"))
        return
      }

      setIsSubmitting(true)

      if (isPinned) {
        const result = announcementSchema.safeParse({
          isPinned,
          pinnedExpiresAt,
        })
        if (!result.success) {
          toast.error(t("expiryRequired"))
          setIsSubmitting(false)
          return
        }
      }

      try {
        const payload = {
          title: title.trim() || undefined,
          body,
          images: images.length > 0 ? images : undefined,
          type: (isPinned ? "ANNOUNCEMENT" : "POST") as "POST" | "ANNOUNCEMENT",
          isPinned,
          pinnedExpiresAt: pinnedExpiresAt || undefined,
        }

        if (isEdit && post) {
          await connectApi.updatePost(post.id, payload)
          toast.success(t("updated"))
        } else {
          await connectApi.createPost(payload)
          toast.success(t("created"))
        }

        setOpen(false)
        resetForm()
        onPostSaved()
      } catch (err) {
        const message = getErrorMessage(err)
        toast.error(t(isEdit ? "updateFailed" : "createFailed", { message }))
      } finally {
        setIsSubmitting(false)
      }
    },
    [
      title,
      body,
      images,
      isPinned,
      pinnedExpiresAt,
      isEdit,
      post,
      onPostSaved,
      resetForm,
      setOpen,
      t,
    ]
  )

  const bodyEmpty = isBodyEmpty(body)

  const dialogContent = (
    <DialogContent className="flex max-h-[calc(100dvh-2rem)] min-h-[min(24rem,calc(100dvh-2rem))] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
      {/* Header */}
      <DialogHeader className="flex shrink-0 flex-row items-center gap-3 border-b bg-popover/95 p-4 backdrop-blur supports-backdrop-filter:bg-popover/80">
        {isEdit ? (
          <>
            <DialogTitle>{t("editTitle")}</DialogTitle>
            <DialogDescription>{t("editDescription")}</DialogDescription>
          </>
        ) : (
          <>
            <Avatar className="size-10 shrink-0">
              {user?.avatarUrl && (
                <AvatarImage
                  src={getImageUrl(user.avatarUrl) || undefined}
                  alt={user ? `${user.firstName} ${user.lastName}` : ""}
                />
              )}
              <AvatarFallback className="text-sm">
                {user?.firstName?.[0]}
                {user?.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <DialogTitle className="truncate">
                {isPinned ? t("announcementTitle") : t("createTitle")}
              </DialogTitle>
              <DialogDescription className="truncate">
                {t("createDescription")}
              </DialogDescription>
            </div>
          </>
        )}
      </DialogHeader>

      {/* Scrollable composer body */}
      <form
        onSubmit={handleSubmit}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <PostComposerFields
            open={open}
            postMode={postMode}
            canAnnounce={canAnnounce}
            isSubmitting={isSubmitting}
            title={title}
            onTitleChange={setTitle}
            onBodyChange={setBody}
            images={images}
            onImagesChange={setImages}
            isPinned={isPinned}
            onIsPinnedChange={setIsPinned}
            pinnedExpiresAt={pinnedExpiresAt}
            onPinnedExpiresAtChange={setPinnedExpiresAt}
            initialBody={isEdit ? post?.body : undefined}
            initialTitle={isEdit ? (post?.title ?? undefined) : undefined}
            pendingAction={isEdit ? "none" : pendingAction}
            onPendingActionConsumed={
              isEdit ? undefined : onPendingActionConsumed
            }
          />
        </div>

        {/* Footer */}
        <DialogFooter className="m-0 shrink-0">
          <Button
            type="button"
            variant="outline"
            disabled={isSubmitting}
            onClick={() => setOpen(false)}
          >
            {tc("cancel")}
          </Button>
          <Button type="submit" disabled={isSubmitting || bodyEmpty}>
            {isSubmitting && (
              <Spinner data-icon="inline-start" className="size-4" />
            )}
            {isSubmitting
              ? isEdit
                ? tc("saving")
                : t("publishing")
              : isEdit
                ? tc("save")
                : t("publish")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )

  // Edit mode: wrapped in DialogTrigger
  if (isEdit && children) {
    return (
      <Dialog
        open={open}
        onOpenChange={(newOpen) => {
          const wasOpen = prevOpenRef.current
          prevOpenRef.current = newOpen
          setOpen(newOpen)
          if (!newOpen && wasOpen) resetForm()
        }}
      >
        <DialogTrigger asChild>{children}</DialogTrigger>
        {dialogContent}
      </Dialog>
    )
  }

  // Create mode: controlled/uncontrolled
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {dialogContent}
    </Dialog>
  )
}
