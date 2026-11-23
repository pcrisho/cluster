"use client"

import { useState } from "react"
import { Share2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ShareSpaceDialog } from "@/components/know/share-space-dialog"
import { useSpace } from "@/components/know/space/space-context"
import { useTranslations } from "next-intl"

/** Opens "who can see this space"; only for people who manage the current space. */
export function ShareSpaceButton({
  defaultOpen = false,
}: {
  defaultOpen?: boolean
}) {
  const t = useTranslations("know.space")
  const { space, canManage, refresh } = useSpace()
  const [open, setOpen] = useState(defaultOpen)
  if (!space || !canManage) return null

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Share2Icon data-icon="inline-start" />
        {t("share")}
      </Button>
      <ShareSpaceDialog
        spaceId={space.id}
        spaceName={space.name}
        open={open}
        onOpenChange={setOpen}
        onChanged={() => void refresh()}
      />
    </>
  )
}
