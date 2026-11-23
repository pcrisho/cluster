"use client"

import { SpaceDescriptionEditor } from "@/components/know/space-description-editor"
import { useCollabDocument } from "@/lib/collab/use-collab-document"
import { renderPageContent } from "@/lib/know-utils"
import type { Space } from "@/lib/know-api"
import { serializeRichText } from "@/lib/rich-text/content"
import { useTranslations } from "next-intl"

interface SpaceDescriptionProps {
  space: Space
  canManage: boolean
}

/**
 * Description block of the space. Live (`know.space`) for everyone who can read the space; the
 * REST copy is the first paint and the read-only fallback while collab is unreachable.
 */
export function SpaceDescription({ space, canManage }: SpaceDescriptionProps) {
  const t = useTranslations("know.space")
  const collab = useCollabDocument({ kind: "know.space", id: space.id })
  const live = collab?.synced ?? false
  const unreachable =
    canManage &&
    (collab?.status === "unavailable" || collab?.status === "disconnected")

  const notice = unreachable ? (
    <p className="text-xs text-muted-foreground">{t("liveUnavailable")}</p>
  ) : null

  if (live && collab) {
    return (
      <div className="flex flex-col gap-2">
        <SpaceDescriptionEditor
          key={collab.generation}
          ydoc={collab.ydoc}
          provider={collab.provider}
          editable={canManage && collab.status === "connected"}
          spaceId={space.id}
        />
        {notice}
      </div>
    )
  }

  if (!space.descriptionContent) return notice

  return (
    <div className="flex flex-col gap-2">
      <div
        className="prose prose-base max-w-none break-words"
        dangerouslySetInnerHTML={{
          __html: renderPageContent(
            serializeRichText(space.descriptionContent)
          ),
        }}
      />
      {notice}
    </div>
  )
}
