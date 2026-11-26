"use client"

import { useEffect, useState } from "react"
import { ArrowLeftIcon, GitCompareIcon, RotateCcwIcon } from "lucide-react"
import { toast } from "sonner"

import { ApiError, getErrorMessage } from "@/lib/api"
import { diffLines, type DiffLine } from "@/lib/line-diff"
import { knowApi, type PageVersionSummary } from "@/lib/know-api"
import { pageTitle } from "@/lib/page-title"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { useDates } from "@/lib/i18n/use-dates"
import { useTranslations } from "next-intl"

interface PageVersionsSheetProps {
  pageId: string
  canEdit: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Called after a restore so the page is fetched again. */
  onRestored: () => void
}

interface Comparison {
  version: PageVersionSummary
  lines: DiffLine[]
}

/** Saved versions of a page; each can be compared with the page as it is now, or restored. */
export function PageVersionsSheet({
  pageId,
  canEdit,
  open,
  onOpenChange,
  onRestored,
}: PageVersionsSheetProps) {
  const tc = useTranslations("common")
  const t = useTranslations("know.versions")
  const dates = useDates()
  const [versions, setVersions] = useState<PageVersionSummary[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    knowApi
      .getPageVersions(pageId)
      .then((res) => !cancelled && setVersions(res.data))
      .catch(() => !cancelled && toast.error(t("loadFailed")))
    return () => {
      cancelled = true
    }
  }, [open, pageId, t])

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setVersions(null)
      setComparison(null)
    }
    onOpenChange(next)
  }

  const compare = async (version: PageVersionSummary) => {
    setBusy(version.id)
    try {
      // The converter is only needed here, so it loads with the first comparison.
      const [{ docToMarkdown }, saved, current] = await Promise.all([
        import("@cluster/editor-schema"),
        knowApi.getPageVersion(pageId, version.id),
        knowApi.getPage(pageId),
      ])
      setComparison({
        version,
        lines: diffLines(
          docToMarkdown(saved.data.content).markdown.trimEnd(),
          docToMarkdown(current.data.content).markdown.trimEnd()
        ),
      })
    } catch {
      toast.error(t("compareFailed"))
    } finally {
      setBusy(null)
    }
  }

  const restore = async (version: PageVersionSummary) => {
    setBusy(version.id)
    try {
      await knowApi.restorePageVersion(pageId, version.id)
      toast.success(t("restored", { version: version.version }))
      onRestored()
      handleOpenChange(false)
    } catch (err) {
      toast.error(
        err instanceof ApiError && err.status === 503
          ? getErrorMessage(err)
          : t("restoreFailed")
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>
            {comparison ? t("versusNow", { version: comparison.version.version }) : t("title")}
          </SheetTitle>
          <SheetDescription>
            {comparison
              ? t("legend")
              : versions
                ? t("count", { count: versions.length })
                : t("loading")}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-6">
          {comparison ? (
            <ComparisonView comparison={comparison} onBack={() => setComparison(null)} />
          ) : versions === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : versions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t("none")}
            </p>
          ) : (
            <ItemGroup>
              {versions.map((v, index) => (
                <Item key={v.id} variant="outline" size="sm">
                  <ItemMedia variant="icon">
                    <Badge variant="secondary">{tc("version", { version: v.version })}</Badge>
                  </ItemMedia>
                  <ItemContent>
                    <ItemTitle>
                      {pageTitle(v.title)}
                      {index === 0 && <Badge variant="outline">{t("latest")}</Badge>}
                    </ItemTitle>
                    <ItemDescription>
                      {v.author.firstName} {v.author.lastName} ·{" "}
                      {dates.relative(v.createdAt)}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      variant="ghost"
                      size="xs"
                      disabled={busy !== null}
                      onClick={() => void compare(v)}
                    >
                      <GitCompareIcon data-icon="inline-start" />
                      {t("compare")}
                    </Button>
                    {canEdit && (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={busy !== null}
                        onClick={() => void restore(v)}
                      >
                        <RotateCcwIcon data-icon="inline-start" />
                        {t("restore")}
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ComparisonView({
  comparison,
  onBack,
}: {
  comparison: Comparison
  onBack: () => void
}) {
  const t = useTranslations("know.versions")
  const changed = comparison.lines.some((l) => l.kind !== "same")
  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeftIcon data-icon="inline-start" />
        {t("all")}
      </Button>
      {!changed ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("same")}
        </p>
      ) : (
        <pre
          className="overflow-x-auto rounded-lg border bg-muted/30 py-2 font-mono text-xs leading-relaxed"
          aria-label={t("differences")}
        >
          {comparison.lines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 px-3 whitespace-pre-wrap",
                line.kind === "added" &&
                  "bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
                line.kind === "removed" &&
                  "bg-destructive/10 text-destructive"
              )}
            >
              <span aria-hidden className="w-3 shrink-0 select-none">
                {line.kind === "added" ? "+" : line.kind === "removed" ? "−" : ""}
              </span>
              <span className="min-w-0 break-words">{line.text || " "}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  )
}
