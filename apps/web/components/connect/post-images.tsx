import { useState } from "react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"
import { getImageUrl } from "@/lib/images"
import { mosaicLayout } from "@/components/connect/post-images-layout"

interface PostImagesProps {
  images: string[]
  title?: string | null
}

/**
 * One photo takes the full width and its own height. Only a photo taller than 4:5 is cropped,
 * so a phone portrait does not fill the screen. The ratio is read once the image has loaded.
 */
function SinglePhoto({ url, alt }: { url: string; alt: string }) {
  const [ratio, setRatio] = useState(4 / 3)
  return (
    <div className="overflow-hidden rounded-lg" style={{ aspectRatio: ratio }}>
      {/* Plain <img>: private files authenticate with a cookie the next/image optimizer would not send. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={getImageUrl(url) ?? ""}
        alt={alt}
        onLoad={(e) => {
          const { naturalWidth: w, naturalHeight: h } = e.currentTarget
          if (w && h) setRatio(Math.max(w / h, 4 / 5))
        }}
        className="h-full w-full object-cover"
      />
    </div>
  )
}

/** Photos of a feed post: one keeps its shape, several form a mosaic (see `post-images-layout.ts`). */
export function PostImages({ images, title }: PostImagesProps) {
  const t = useTranslations("connect.post")
  const alt = (index: number) =>
    t("image", { title: title ?? t("imageFallback"), index })

  if (images.length === 1) {
    return <SinglePhoto url={images[0]} alt={alt(1)} />
  }

  const { visible, frame, first } = mosaicLayout(images.length)
  const left = images.length - visible

  return (
    <div className={cn("grid gap-0.5 overflow-hidden rounded-lg", frame)}>
      {images.slice(0, visible).map((url, i) => {
        const isLastOverlay = left > 0 && i === visible - 1
        return (
          <div
            key={url}
            className={cn("relative overflow-hidden", i === 0 && first)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getImageUrl(url) ?? ""}
              alt={alt(i + 1)}
              className={cn(
                "h-full w-full object-cover",
                isLastOverlay && "brightness-50"
              )}
            />
            {isLastOverlay && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl font-bold text-white">+{left}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
