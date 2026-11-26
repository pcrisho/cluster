"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  BoldIcon,
  ItalicIcon,
  StrikethroughIcon,
  XIcon,
  MegaphoneIcon,
  ImageIcon,
  TypeIcon,
} from "lucide-react"
import { toast } from "sonner"
import {
  EditorContent,
  useEditor,
  useEditorState,
  type Editor,
} from "@tiptap/react"
import { BubbleMenu, type BubbleMenuProps } from "@tiptap/react/menus"

import { cn } from "@/lib/utils"
import { getImageUrl, uploadImage } from "@/lib/images"
import { compressForPost } from "@/lib/compress-image"
import { parseRichText, serializeRichText } from "@/lib/rich-text/content"
import { POST_EDITOR_EXTENSIONS } from "@/components/connect/post-editor-extensions"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"
import { DatePicker } from "@/components/ui/date-picker"
import { Spinner } from "@/components/ui/spinner"
import { useTranslations } from "next-intl"

const MAX_IMAGES = 10

export type PostMode = "POST" | "ARTICLE" | "ANNOUNCEMENT"

export type PendingAction = "none" | "open-picker" | "focus-editor"

// Module-level: BubbleMenu re-registers its plugin when this identity changes.
const BUBBLE_OPTIONS: BubbleMenuProps["options"] = { placement: "top" }

// Module-level: useEditor re-applies options whose identity changed.
const EDITOR_PROPS = {
  attributes: {
    class:
      "min-h-0 min-w-0 max-w-full flex-1 resize-none overflow-y-auto break-words text-base leading-relaxed focus:outline-none [&_*]:min-w-0",
  },
}

function FormatButtons({ editor }: { editor: Editor }) {
  const t = useTranslations("editor")
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      bold: current.isActive("bold"),
      italic: current.isActive("italic"),
      strike: current.isActive("strike"),
    }),
  })

  const items = [
    {
      name: "bold" as const,
      active: active.bold,
      command: () => editor.chain().focus().toggleBold().run(),
      icon: BoldIcon,
    },
    {
      name: "italic" as const,
      active: active.italic,
      command: () => editor.chain().focus().toggleItalic().run(),
      icon: ItalicIcon,
    },
    {
      name: "strike" as const,
      active: active.strike,
      command: () => editor.chain().focus().toggleStrike().run(),
      icon: StrikethroughIcon,
    },
  ]

  return (
    <>
      {items.map((item) => (
        <Button
          key={item.name}
          type="button"
          size="sm"
          className="rounded-none"
          variant="ghost"
          onClick={item.command}
          aria-label={t(item.name)}
          aria-pressed={item.active}
        >
          <item.icon
            className={cn("size-4", item.active ? "text-primary" : "")}
          />
        </Button>
      ))}
    </>
  )
}

interface PostComposerFieldsProps {
  open: boolean
  postMode: PostMode
  canAnnounce: boolean
  isSubmitting: boolean
  title: string
  onTitleChange: (v: string) => void
  onBodyChange: (v: string) => void
  images: string[]
  onImagesChange: (v: string[]) => void
  isPinned: boolean
  onIsPinnedChange: (v: boolean) => void
  pinnedExpiresAt: string
  onPinnedExpiresAtChange: (v: string) => void
  initialBody?: string
  initialTitle?: string
  pendingAction?: PendingAction
  onPendingActionConsumed?: () => void
}

export function PostComposerFields({
  open,
  postMode,
  canAnnounce,
  isSubmitting,
  title,
  onTitleChange,
  onBodyChange,
  images,
  onImagesChange,
  isPinned,
  onIsPinnedChange,
  pinnedExpiresAt,
  onPinnedExpiresAtChange,
  initialBody,
  initialTitle,
  pendingAction = "none",
  onPendingActionConsumed,
}: PostComposerFieldsProps) {
  const t = useTranslations("connect.composer")
  const [titleOpen, setTitleOpen] = useState(
    postMode !== "POST" || !!initialTitle
  )
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingActionRef = useRef(pendingAction)

  // Created by the first render after mount; null until then.
  const editor = useEditor({
    extensions: POST_EDITOR_EXTENSIONS,
    // Bodies are serialized TipTap documents (the API rejects HTML).
    content: initialBody ? parseRichText(initialBody) : "",
    immediatelyRender: false,
    editorProps: EDITOR_PROPS,
    onCreate: ({ editor }) => onBodyChange(serializeRichText(editor.getJSON())),
    onUpdate: ({ editor }) => onBodyChange(serializeRichText(editor.getJSON())),
  })
  const editorReady = editor !== null

  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (
        !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
          file.type
        )
      ) {
        toast.error(t("onlyImages", { name: file.name }))
        return null
      }

      if (file.size > 10 * 1024 * 1024) {
        toast.error(t("tooLarge", { name: file.name }))
        return null
      }

      try {
        const compressed = await compressForPost(file)
        return await uploadImage(compressed)
      } catch {
        toast.error(t("uploadFailed", { name: file.name }))
        return null
      }
    },
    [t]
  )

  const processFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArray = Array.from(files)
      const remaining = MAX_IMAGES - images.length
      if (fileArray.length > remaining) {
        toast.error(t("tooMany", { max: MAX_IMAGES, remaining }))
      }
      const toUpload = fileArray.slice(0, remaining)

      setIsUploading(true)
      const results = await Promise.all(toUpload.map((f) => uploadFile(f)))
      const urls = results.filter(Boolean) as string[]
      onImagesChange([...images, ...urls])
      setIsUploading(false)
    },
    [images, onImagesChange, uploadFile, t]
  )

  const handleImageSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files?.length) return
      await processFiles(files)
      if (fileInputRef.current) fileInputRef.current.value = ""
    },
    [processFiles]
  )

  const removeImage = useCallback(
    (url: string) => {
      onImagesChange(images.filter((u) => u !== url))
    },
    [images, onImagesChange]
  )

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const focusEditor = useCallback(() => {
    editor?.chain().focus().run()
  }, [editor])

  // Fulfill pending trigger action after the editor mounts
  useEffect(() => {
    if (!open) return
    const action = pendingActionRef.current
    if (action === "none") return
    if (!editorReady) return

    const id = setTimeout(() => {
      if (action === "open-picker") openFilePicker()
      else if (action === "focus-editor") focusEditor()
      pendingActionRef.current = "none"
      onPendingActionConsumed?.()
    }, 50)

    return () => clearTimeout(id)
  }, [open, editorReady, openFilePicker, focusEditor, onPendingActionConsumed])

  return (
    <>
      {/* Title (revealable in POST mode, default-open in ARTICLE/ANNOUNCEMENT) */}
      <Collapsible open={titleOpen} onOpenChange={setTitleOpen}>
        {!titleOpen ? (
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
            >
              <TypeIcon data-icon="inline-start" />
              {t("addHeadline")}
            </Button>
          </CollapsibleTrigger>
        ) : (
          <CollapsibleContent>
            <div className="flex items-center justify-between">
              <input
                id="post-title"
                type="text"
                placeholder={t("titlePlaceholder")}
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                disabled={isSubmitting}
                className="flex-1 border-0 bg-transparent py-1 text-base font-semibold text-foreground outline-none placeholder:text-muted-foreground"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  setTitleOpen(false)
                  onTitleChange("")
                }}
                disabled={isSubmitting}
                className="text-muted-foreground"
              >
                <XIcon />
                <span className="sr-only">{t("removeHeadline")}</span>
              </Button>
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>

      {/* Rich text editor — embedded, no border, no background, fills available height */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <EditorContent
          editor={editor}
          className="flex min-h-0 min-w-0 flex-1 flex-col"
        />
        {editor && (
          <BubbleMenu
            editor={editor}
            options={BUBBLE_OPTIONS}
            className="flex w-fit max-w-[90vw] overflow-hidden rounded-md border border-border bg-background shadow-xl"
          >
            <FormatButtons editor={editor} />
          </BubbleMenu>
        )}
      </div>

      {/* Image previews — thumbnails inline */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((url) => (
            <div
              key={url}
              className="group relative size-20 overflow-hidden rounded-lg"
            >
              {/* Plain <img>: private files authenticate with a cookie the next/image optimizer would not send. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getImageUrl(url) ?? ""}
                alt={t("uploadPreview")}
                className="size-full object-cover"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-xs"
                onClick={() => removeImage(url)}
                className="absolute top-0.5 right-0.5 bg-background/80 opacity-0 backdrop-blur transition-opacity group-hover:opacity-100"
              >
                <XIcon />
                <span className="sr-only">{t("removeImage")}</span>
              </Button>
            </div>
          ))}
          {isUploading && (
            <div className="flex size-20 items-center justify-center rounded-lg bg-muted">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          )}
        </div>
      )}

      {/* Announcement expiry — only when pinned */}
      {isPinned && (
        <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
          <MegaphoneIcon className="size-4 shrink-0 text-primary" />
          <span className="shrink-0 text-xs text-muted-foreground">
            {t("expiresOn")}
          </span>
          <DatePicker
            value={pinnedExpiresAt}
            onChange={onPinnedExpiresAtChange}
            placeholder={t("expiryPlaceholder")}
          />
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleImageSelect}
      />

      {/* Action bar — LinkedIn-style icon row */}
      <div className="flex items-center gap-1 border-t pt-3">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={openFilePicker}
          className="text-muted-foreground"
        >
          <ImageIcon />
          <span className="sr-only">{t("addPhoto")}</span>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => setTitleOpen(!titleOpen)}
          className="text-muted-foreground"
        >
          <TypeIcon />
          <span className="sr-only">{t("addHeadline")}</span>
        </Button>
        {canAnnounce && (
          <>
            <Separator orientation="vertical" className="h-6" />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => onIsPinnedChange(!isPinned)}
              className={cn(
                "text-muted-foreground",
                isPinned && "text-primary"
              )}
            >
              <MegaphoneIcon />
              <span className="sr-only">{t("toggleAnnouncement")}</span>
            </Button>
          </>
        )}
      </div>
    </>
  )
}
