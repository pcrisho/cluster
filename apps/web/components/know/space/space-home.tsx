"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import {
  FilePlusIcon,
  FileTextIcon,
  LockIcon,
  MoreHorizontalIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/lib/auth-context"
import { useBreadcrumb } from "@/lib/breadcrumb-context"
import { knowApi, type PageTreeNode, type Space } from "@/lib/know-api"
import { pageTitle } from "@/lib/page-title"
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import {
  Item,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { EntityGlyph } from "@/components/shared/entity-glyph"
import { EntityIconPicker } from "@/components/shared/entity-icon-picker"
import { ImportMarkdownDialog } from "@/components/know/import-markdown-dialog"
import { SavingIndicator } from "@/components/shared/saving-indicator"
import { ShareSpaceButton } from "@/components/know/share-space-button"
import { SpaceDescription } from "@/components/know/space/space-description"
import { AttachedFiles } from "@/components/shared/documents"
import { useSpace } from "@/components/know/space/space-context"
import { useSpaceDraft } from "@/components/know/space/use-space-draft"
import { useCreatePage } from "@/components/know/use-create-page"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

const RECENT = 6

/** "First Last · " for whoever edited the page last (its author until someone edits it). */
function lastEditor(page: PageTreeNode): string {
  const editor = page.lastEditedBy ?? page.author
  return editor ? `${editor.firstName} ${editor.lastName} · ` : ""
}

/** The landing page of a space: who it is, what it is for, and what changed lately. */
export function SpaceHome({ space }: { space: Space }) {
  const th = useTranslations("know.home")
  const ts = useTranslations("know.status")
  const tc = useTranslations("common")
  const t = useTranslations("know.space")
  const dates = useDates()
  const { user } = useAuth()
  const router = useRouter()
  const { pages, canEdit, canManage, refresh } = useSpace()
  const { setItems: setBreadcrumb } = useBreadcrumb()
  const { draft, indicatorState, retryAll, handlers } = useSpaceDraft(
    space,
    () => void refresh()
  )
  const { create, isCreating } = useCreatePage(space.id, refresh)
  const searchParams = useSearchParams()
  const pathname = usePathname()
  // `?share=1` (a restricted space was just created) opens Share once; drop it so a reload does not.
  const openShare = searchParams.get("share") === "1"
  useEffect(() => {
    if (openShare) window.history.replaceState(null, "", pathname)
  }, [openShare, pathname])
  const [importOpen, setImportOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const canDelete =
    user?.role === "ADMIN" ||
    (canManage && !!user?.capabilities.includes("KNOW_SPACE_DELETE"))

  useEffect(() => {
    setBreadcrumb([
      { label: "Know", href: "/know" },
      { label: t("spaces"), href: "/know" },
      { label: space.name },
    ])
  }, [space.name, setBreadcrumb, t])

  const recent = [...pages]
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
    .slice(0, RECENT)

  const handleDelete = async () => {
    try {
      await knowApi.deleteSpace(space.id)
      toast.success(t("deleted"))
      router.push("/know")
    } catch {
      toast.error(t("deleteFailed"))
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 p-6 md:p-10">
      <header className="space-y-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {canManage ? (
              <EntityIconPicker
                current={{
                  iconType: draft.iconType,
                  icon: draft.icon,
                  emoji: draft.emoji,
                }}
                onChange={handlers.handleIconChange}
                onRemove={handlers.handleIconRemove}
              >
                <Button
                  variant="ghost"
                  size="icon-lg"
                  className="size-12 shrink-0"
                  aria-label={t("changeIcon")}
                >
                  <EntityGlyph
                    iconType={draft.iconType}
                    icon={draft.icon}
                    emoji={draft.emoji}
                    fallback="book-open"
                    size="lg"
                    className="text-muted-foreground"
                  />
                </Button>
              </EntityIconPicker>
            ) : (
              <EntityGlyph
                iconType={draft.iconType}
                icon={draft.icon}
                emoji={draft.emoji}
                fallback="book-open"
                size="lg"
                className="shrink-0 text-muted-foreground"
              />
            )}
            {canManage ? (
              <Input
                value={draft.name}
                onChange={(e) => handlers.handleNameChange(e.target.value)}
                aria-label={t("name")}
                maxLength={100}
                className="h-auto min-w-0 border-0 bg-transparent px-1 py-0 text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-3xl dark:bg-transparent"
              />
            ) : (
              <h1 className="truncate text-3xl font-semibold tracking-tight">
                {draft.name}
              </h1>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <SavingIndicator
              state={indicatorState}
              onRetry={indicatorState === "failed" ? retryAll : undefined}
            />
            <ShareSpaceButton defaultOpen={openShare} />
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("moreActions")}
                  >
                    <MoreHorizontalIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={isCreating}
                    onSelect={() => void create()}
                  >
                    <FilePlusIcon />
                    {t("newPage")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setImportOpen(true)}>
                    <UploadIcon />
                    {t("importMarkdown")}
                  </DropdownMenuItem>
                  {canDelete && (
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
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-1 text-sm text-muted-foreground">
          <span>{th("pages", { count: pages.length })}</span>
          <span aria-hidden>·</span>
          <span>{t("updated", { when: dates.relative(space.updatedAt) })}</span>
          {space.restricted && (
            <Badge variant="outline" className="ml-1">
              <LockIcon data-icon="inline-start" />
              {t("restricted")}
            </Badge>
          )}
        </div>

        <SpaceDescription space={space} canManage={canManage} />
      </header>

      {recent.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FileTextIcon />
            </EmptyMedia>
            <EmptyTitle>{t("noPages")}</EmptyTitle>
            <EmptyDescription>
              {canEdit ? t("noPagesEditor") : t("noPagesReader")}
            </EmptyDescription>
          </EmptyHeader>
          {canEdit && (
            <EmptyContent className="flex-row justify-center">
              <Button disabled={isCreating} onClick={() => void create()}>
                <FilePlusIcon data-icon="inline-start" />
                {t("newPage")}
              </Button>
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <UploadIcon data-icon="inline-start" />
                {t("importMarkdown")}
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <section aria-labelledby="recent-heading" className="space-y-3">
          <h2
            id="recent-heading"
            className="text-sm font-medium text-muted-foreground"
          >
            {t("recent")}
          </h2>
          <ItemGroup>
            {recent.map((page) => (
              <Item key={page.id} asChild variant="outline" size="sm">
                <Link href={`/know/spaces/${space.id}/${page.id}`}>
                  <ItemMedia variant="icon">
                    <EntityGlyph
                      iconType={page.iconType}
                      icon={page.icon}
                      emoji={page.emoji}
                    />
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>{pageTitle(page.title)}</ItemTitle>
                    <ItemDescription>
                      {lastEditor(page)}
                      {dates.relative(page.updatedAt)}
                    </ItemDescription>
                  </ItemContent>
                  {page.status !== "PUBLISHED" && (
                    <Badge variant="outline">{ts(page.status)}</Badge>
                  )}
                </Link>
              </Item>
            ))}
          </ItemGroup>
        </section>
      )}

      <AttachedFiles
        owner={{ kind: "space", id: space.id }}
        canUpload={canManage}
      />

      {canEdit && (
        <ImportMarkdownDialog
          spaceId={space.id}
          open={importOpen}
          onOpenChange={setImportOpen}
          onImported={() => void refresh()}
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
            <AlertDialogAction variant="destructive" onClick={handleDelete}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
