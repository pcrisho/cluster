"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  DownloadIcon,
  HistoryIcon,
  MoreHorizontalIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import {
  knowApi,
  type PageDetail,
  type PageStatus,
  type PageTreeNode,
  type Tag,
} from "@/lib/know-api"
import type { CollabSnapshot } from "@/lib/collab/collab-session"
import type { SavingState } from "@/lib/use-entity-autosave"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EntityViewEditToggle } from "@/components/know/entity-view-edit-toggle"
import { SavingIndicator } from "@/components/shared/saving-indicator"
import { ShareSpaceButton } from "@/components/know/share-space-button"
import { PageDetailsPopover } from "@/components/know/page/page-details-popover"
import { PageVersionsSheet } from "@/components/know/page/page-versions-sheet"
import { ConnectionStatus } from "@/components/shared/collab/connection-status"
import { PresenceAvatars } from "@/components/shared/collab/presence-avatars"
import { useTranslations } from "next-intl"

interface PageToolbarProps {
  page: PageDetail
  pageTree: PageTreeNode[]
  availableTags: Tag[]
  canEdit: boolean
  collab: CollabSnapshot | null
  savingState: SavingState
  onToggleEdit: () => void
  onStatusChange: (status: PageStatus) => void
  onParentChange: (parentId: string | null) => void
  onTagsChange: (tagIds: string[]) => void
  /** The page or the tree changed: fetch them again. */
  onChanged: () => void
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" })
  )
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/** Who is here, what is being saved, and everything that is not the text of the page. */
export function PageToolbar({
  page,
  pageTree,
  availableTags,
  canEdit,
  collab,
  savingState,
  onToggleEdit,
  onStatusChange,
  onParentChange,
  onTagsChange,
  onChanged,
}: PageToolbarProps) {
  const ts = useTranslations("know.status")
  const tc = useTranslations("common")
  const t = useTranslations("know.page")
  const router = useRouter()
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const saveVersion = async () => {
    try {
      await knowApi.createPageVersion(page.id)
      toast.success(t("versionSaved"))
      onChanged()
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 503
          ? getErrorMessage(err)
          : t("versionFailed")
      )
    }
  }

  const exportMarkdown = async () => {
    try {
      const { data } = await knowApi.exportPage(page.id)
      download(data.filename, data.markdown)
      if (data.lost.length > 0) {
        toast.info(t("exportedReduced"), {
          description: t("exportLost", { items: data.lost.join(", ") }),
        })
      }
    } catch {
      toast.error(t("exportFailed"))
    }
  }

  const deletePage = async () => {
    try {
      await knowApi.deletePage(page.id)
      toast.success(t("deleted"))
      router.push(`/know/spaces/${page.spaceId}`)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? getErrorMessage(err) : t("deleteFailed")
      )
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      {page.status !== "PUBLISHED" && (
        <Badge variant="outline" className="mr-auto">
          {ts(page.status)}
        </Badge>
      )}
      {collab && <PresenceAvatars peers={collab.peers} />}
      {collab && collab.status !== "connected" && (
        <ConnectionStatus status={collab.status} />
      )}
      <SavingIndicator state={savingState} />
      {canEdit && (
        <EntityViewEditToggle
          storageKey={`know:page:edit:${page.id}`}
          onChange={onToggleEdit}
        />
      )}
      <PageDetailsPopover
        page={page}
        pageTree={pageTree}
        availableTags={availableTags}
        canEdit={canEdit}
        onStatusChange={onStatusChange}
        onParentChange={onParentChange}
        onTagsChange={onTagsChange}
      />
      <ShareSpaceButton />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t("actions")}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {canEdit && (
            <DropdownMenuItem onSelect={() => void saveVersion()}>
              <SaveIcon />
              {t("saveVersion")}
            </DropdownMenuItem>
          )}
          {canEdit && (
            <DropdownMenuItem onSelect={() => setVersionsOpen(true)}>
              <HistoryIcon />
              {t("history")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void exportMarkdown()}>
            <DownloadIcon />
            {t("export")}
          </DropdownMenuItem>
          {canEdit && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => setDeleteOpen(true)}
              >
                <Trash2Icon />
                {t("delete")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {canEdit && (
        <PageVersionsSheet
          pageId={page.id}
          canEdit={canEdit}
          open={versionsOpen}
          onOpenChange={setVersionsOpen}
          onRestored={onChanged}
        />
      )}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={deletePage}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
