"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { useOrgNodes } from "@/hooks/use-org-nodes"
import { adminApi, type AccessKind } from "@/lib/admin-api"
import { DEFAULT_LIFETIME, LIFETIME_PRESETS } from "@/lib/access-lifetimes"
import { getErrorMessage } from "@/lib/api"
import { areaPathLabel } from "@/lib/partition"

export type NodeAccessMode = "export" | "invite"

/** Downloads the workbook under a dated name, as the browser would any file. */
function saveWorkbook(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = `cluster-access-${new Date().toISOString().slice(0, 10)}.xlsx`
  anchor.click()
  // Revoked on the next tick: Firefox cancels a download whose URL is revoked during the click.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/**
 * Credentials for an area and everything below it (docs/specs/auth/access-without-mail): a workbook to hand over,
 * or invitations queued for the paced sender (mail on only).
 */
export function NodeAccessDialog({
  mode,
  onOpenChange,
}: {
  mode: NodeAccessMode
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("settings.members.nodeAccess")
  const { nodes } = useOrgNodes()
  const [nodeId, setNodeId] = useState<string | null>(null)
  const [kind, setKind] = useState<AccessKind>("link")
  const [lifetime, setLifetime] = useState<number>(DEFAULT_LIFETIME.INVITE)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const labels = useMemo(
    () =>
      new Map(nodes.map((n) => [n.id, { name: n.name, parentId: n.parentId }])),
    [nodes]
  )
  const lifetimeLabel = (hours: number) =>
    hours % 24 === 0
      ? t("lifetime.days", { count: hours / 24 })
      : t("lifetime.hours", { count: hours })

  async function run() {
    if (!nodeId) return
    setBusy(true)
    try {
      if (mode === "export") {
        const { blob, headers } = await adminApi.exportAccess({
          nodeId,
          kind,
          lifetime,
        })
        saveWorkbook(blob)
        setDone(
          t("exported", {
            skipped: Number(headers.get("X-Skipped-Active") ?? 0),
          })
        )
      } else {
        const { queued } = await adminApi.queueInvitations(nodeId)
        toast.success(t("queued", { count: queued }))
        onOpenChange(false)
      }
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "export" ? t("exportTitle") : t("inviteTitle")}
          </DialogTitle>
          <DialogDescription>
            {mode === "export"
              ? t("exportDescription")
              : t("inviteDescription")}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <>
            <p className="text-sm text-foreground">{done}</p>
            <p className="text-sm text-muted-foreground">{t("secret")}</p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>{t("close")}</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="node-access-area">{t("area")}</FieldLabel>
                <Select value={nodeId ?? ""} onValueChange={setNodeId}>
                  <SelectTrigger id="node-access-area" className="w-full">
                    <SelectValue placeholder={t("pickArea")} />
                  </SelectTrigger>
                  <SelectContent>
                    {nodes.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {areaPathLabel(n.id, labels)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              {mode === "export" && (
                <>
                  <Field>
                    <FieldLabel htmlFor="node-access-kind">
                      {t("what")}
                    </FieldLabel>
                    <Select
                      value={kind}
                      onValueChange={(v) => setKind(v as AccessKind)}
                    >
                      <SelectTrigger id="node-access-kind" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="link">{t("kind.link")}</SelectItem>
                        <SelectItem value="password">
                          {t("kind.password")}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {kind === "password" ? t("passwordNote") : t("linkNote")}
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="node-access-lifetime">
                      {t("lifetimeLabel")}
                    </FieldLabel>
                    <Select
                      value={String(lifetime)}
                      onValueChange={(v) => setLifetime(Number(v))}
                    >
                      <SelectTrigger
                        id="node-access-lifetime"
                        className="w-full"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LIFETIME_PRESETS.INVITE.map((hours) => (
                          <SelectItem key={hours} value={String(hours)}>
                            {lifetimeLabel(hours)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <p className="text-sm text-muted-foreground">{t("secret")}</p>
                </>
              )}
            </FieldGroup>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={busy}
              >
                {t("cancel")}
              </Button>
              <Button onClick={run} disabled={!nodeId || busy}>
                {busy && <Spinner data-icon="inline-start" />}
                {busy
                  ? mode === "export"
                    ? t("exporting")
                    : t("sending")
                  : mode === "export"
                    ? t("export")
                    : t("send")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
