"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2Icon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import { knowApi } from "@/lib/know-api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useTranslations } from "next-intl"

// Mirrors the API limit; the API is the one that enforces it.
const MAX_CHARS = 500_000

interface ImportMarkdownDialogProps {
  spaceId: string
  /** The imported page becomes a child of this one. */
  parentId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

export function ImportMarkdownDialog({
  spaceId,
  parentId,
  open,
  onOpenChange,
  onImported,
}: ImportMarkdownDialogProps) {
  const tc = useTranslations("common")
  const t = useTranslations("know.import")
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (!next) setFile(null)
    onOpenChange(next)
  }

  const handleImport = async () => {
    if (!file) return
    setIsImporting(true)
    try {
      const markdown = await file.text()
      if (markdown.length > MAX_CHARS) {
        toast.error(t("tooLong"))
        return
      }
      const result = await knowApi.importMarkdown(spaceId, {
        markdown,
        title: file.name.replace(/\.(md|markdown|txt)$/i, ""),
        ...(parentId ? { parentId } : {}),
      })
      toast.success(t("imported"), {
        description: result.dropped.length
          ? t("leftOut", { items: result.dropped.join(", ") })
          : undefined,
      })
      onImported?.()
      handleOpenChange(false)
      router.push(`/know/spaces/${spaceId}/${result.data.id}`)
    } catch (err) {
      toast.error(err instanceof ApiError ? getErrorMessage(err) : t("failed"))
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="markdown-file">{t("file")}</FieldLabel>
          <Input
            id="markdown-file"
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <FieldDescription>{t("hint")}</FieldDescription>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleImport} disabled={!file || isImporting}>
            {isImporting ? (
              <Loader2Icon className="animate-spin" data-icon="inline-start" />
            ) : (
              <UploadIcon data-icon="inline-start" />
            )}
            {t("submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
