"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import { PlusIcon, UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import { knowApi } from "@/lib/know-api"
import {
  planMove,
  buildTree,
  type MoveAction,
  type MoveTarget,
} from "@/lib/page-tree"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ImportMarkdownDialog } from "@/components/know/import-markdown-dialog"
import { PageTree } from "@/components/know/space/page-tree"
import { SpaceSwitcher } from "@/components/know/space/space-switcher"
import { useSpace } from "@/components/know/space/space-context"
import { useCreatePage } from "@/components/know/use-create-page"
import { useTranslations } from "next-intl"

/** Space switcher and the full page tree; the same content sits in a drawer on narrow screens. */
export function SpaceSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("know.space")
  const { space, spaceId, pages, canEdit, refresh } = useSpace()
  const params = useParams<{ pageId?: string }>()
  const { create, isCreating } = useCreatePage(spaceId, refresh)
  const [importOpen, setImportOpen] = useState(false)

  if (!space) return null

  const move = (id: string, action: MoveAction) => {
    const target = planMove(buildTree(pages), id, action)
    if (target) void moveTo(id, target)
  }

  const moveTo = async (id: string, target: MoveTarget) => {
    try {
      await knowApi.movePage(id, target)
      await refresh()
    } catch (err) {
      toast.error(
        err instanceof ApiError ? getErrorMessage(err) : t("moveFailed")
      )
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 p-3">
      <SpaceSwitcher space={space} />
      <div className="flex items-center justify-between pl-2">
        <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {t("pages")}
        </h2>
        {canEdit && (
          <div className="flex gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("importMarkdown")}
              onClick={() => setImportOpen(true)}
            >
              <UploadIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("newPage")}
              disabled={isCreating}
              onClick={() => void create()}
            >
              <PlusIcon />
            </Button>
          </div>
        )}
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {pages.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            {t("noPagesShort")}
          </p>
        ) : (
          <PageTree
            spaceId={spaceId}
            pages={pages}
            activeId={params?.pageId}
            canEdit={canEdit}
            onMove={move}
            onDrop={(id, target) => void moveTo(id, target)}
            onCreateChild={(parentId) => void create(parentId)}
            onNavigate={onNavigate}
          />
        )}
      </ScrollArea>
      {canEdit && (
        <ImportMarkdownDialog
          spaceId={spaceId}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={refresh}
        />
      )}
    </div>
  )
}
