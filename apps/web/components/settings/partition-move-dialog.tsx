"use client"

import { useCallback, useState } from "react"
import { useTranslations } from "next-intl"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { PartitionChange } from "@/lib/partition-moves"

/** Runs `apply` at once when `change` is null; otherwise asks first and runs it only on confirm. */
export type AskPartition = (
  change: PartitionChange | null,
  apply: () => void,
  action?: "move" | "archive"
) => void

interface Pending {
  change: PartitionChange
  apply: () => void
  action: "move" | "archive"
}

/**
 * The move confirmation of docs/specs/org/node-partitions (rule 9). Cancel does nothing: nothing has
 * been sent yet, so there is nothing to undo.
 */
export function usePartitionConfirm() {
  const [pending, setPending] = useState<Pending | null>(null)
  const ask = useCallback<AskPartition>((change, apply, action = "move") => {
    if (change) setPending({ change, apply, action })
    else apply()
  }, [])
  const dialog = (
    <PartitionMoveDialog pending={pending} onClose={() => setPending(null)} />
  )
  return { ask, dialog }
}

function PartitionMoveDialog({
  pending,
  onClose,
}: {
  pending: Pending | null
  onClose: () => void
}) {
  const tc = useTranslations("common")
  const t = useTranslations("settings.partitionMove")
  const change = pending?.change

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {change &&
              (change.targetMainNodeName
                ? t("toMainNode", {
                    count: change.count,
                    main: change.targetMainNodeName,
                  })
                : t("losesMainNode", { count: change.count }))}{" "}
            {t("historyStays")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button
            onClick={() => {
              const next = pending
              onClose()
              next?.apply()
            }}
          >
            {pending?.action === "archive" ? t("confirmArchive") : t("confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
