"use client"

import { useState, useCallback } from "react"
import Cropper, { type Area } from "react-easy-crop"
import { ZoomInIcon, ZoomOutIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { getCroppedImg } from "@/lib/crop-image"
import { compressForAvatar } from "@/lib/compress-image"
import { uploadImage } from "@/lib/images"
import { useTranslations } from "next-intl"

/**
 * Crops a picked image to a square, uploads it and hands the stored key to `onSave`.
 * An avatar is a round JPEG; a logo keeps its transparency (PNG) in a square crop.
 */
export function ImageCropperDialog({
  open,
  file,
  onClose,
  onSave,
  labels,
  shape = "round",
  output = { size: 512, type: "image/jpeg" },
}: {
  open: boolean
  file: File | null
  onClose: () => void
  /** Persists the uploaded key; a rejection shows `labels.failed`. */
  onSave: (key: string) => Promise<void>
  labels: {
    title: string
    description: string
    updated: string
    failed: string
  }
  shape?: "round" | "rect"
  output?: { size: number; type: "image/jpeg" | "image/png" }
}) {
  const tc = useTranslations("common")
  const t = labels
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [croppedArea, setCroppedArea] = useState<Area | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const onCropComplete = useCallback((percentArea: Area) => {
    setCroppedArea(percentArea)
  }, [])

  const imageUrl = file ? URL.createObjectURL(file) : ""

  async function handleSave() {
    if (!file || !croppedArea) return

    setIsSaving(true)
    try {
      const croppedBlob = await getCroppedImg(
        imageUrl,
        croppedArea,
        { width: output.size, height: output.size },
        output.type
      )
      const croppedFile = new File([croppedBlob], file.name, {
        type: output.type,
      })
      const compressed =
        output.type === "image/jpeg"
          ? await compressForAvatar(croppedFile)
          : croppedFile
      await onSave(await uploadImage(compressed))
      toast.success(t.updated)
      onClose()
    } catch {
      toast.error(t.failed)
    } finally {
      setIsSaving(false)
    }
  }

  function handleClose() {
    if (!isSaving) {
      URL.revokeObjectURL(imageUrl)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <div className="relative h-80 w-full overflow-hidden rounded-lg bg-muted">
          {imageUrl && (
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape={shape}
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-2">
          <ZoomOutIcon className="size-4 shrink-0 text-muted-foreground" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
          <ZoomInIcon className="size-4 shrink-0 text-muted-foreground" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            {tc("cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Spinner data-icon="inline-start" />}
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
