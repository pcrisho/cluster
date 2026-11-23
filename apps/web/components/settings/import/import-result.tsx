"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCircle2Icon, DownloadIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { NodeAccessDialog } from "@/components/settings/node-access-dialog"
import { saveFile } from "@/components/settings/import/save-file"
import { useOrgNodes } from "@/hooks/use-org-nodes"
import { DEFAULT_LIFETIME } from "@/lib/access-lifetimes"
import { adminApi, type ImportResult } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"

/** After an apply: what was written, and the way to hand over access for each main node it touched. */
export function ImportResultView({
  result,
  invited,
  onAnother,
}: {
  result: ImportResult
  /** Invitations were queued with the import. */
  invited: boolean
  onAnother: () => void
}) {
  const t = useTranslations("settings.import.result")
  const tn = useTranslations("settings.members.nodeAccess")
  const { nodes, isLoading } = useOrgNodes()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  const names = new Map(nodes.map((n) => [n.id, n.name]))

  async function exportNode(nodeId: string) {
    setBusyId(nodeId)
    try {
      const { blob, headers } = await adminApi.exportAccess({
        nodeId,
        kind: "link",
        lifetime: DEFAULT_LIFETIME.INVITE,
      })
      saveFile(
        blob,
        `cluster-access-${new Date().toISOString().slice(0, 10)}.xlsx`
      )
      toast.success(
        tn("exported", {
          skipped: Number(headers.get("X-Skipped-Active") ?? 0),
        })
      )
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3">
        <CheckCircle2Icon
          className="mt-0.5 size-5 shrink-0 text-success-text"
          aria-hidden
        />
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-foreground">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("summary", { created: result.created, updated: result.updated })}
          </p>
          {invited && (
            <p className="text-sm text-muted-foreground">{t("invited")}</p>
          )}
        </div>
      </div>

      {result.mainNodeIds.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-foreground">
            {t("exportTitle")}
          </h3>
          <p className="text-sm text-muted-foreground">{t("exportBody")}</p>
          {isLoading ? (
            <Skeleton className="h-24 w-full rounded-xl" />
          ) : (
            <ul className="flex flex-col divide-y rounded-xl border">
              {result.mainNodeIds.map((id) => (
                <li
                  key={id}
                  className="flex items-center justify-between gap-3 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm">
                    {names.get(id) ?? id}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId !== null}
                    onClick={() => exportNode(id)}
                  >
                    {busyId === id ? (
                      <Spinner data-icon="inline-start" />
                    ) : (
                      <DownloadIcon data-icon="inline-start" />
                    )}
                    {t("export")}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Button variant="ghost" size="sm" onClick={() => setMoreOpen(true)}>
              {t("moreOptions")}
            </Button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild>
          <Link href="/settings/members">{t("back")}</Link>
        </Button>
        <Button variant="outline" onClick={onAnother}>
          {t("another")}
        </Button>
      </div>

      {moreOpen && (
        <NodeAccessDialog
          mode="export"
          onOpenChange={(open) => !open && setMoreOpen(false)}
        />
      )}
    </div>
  )
}
