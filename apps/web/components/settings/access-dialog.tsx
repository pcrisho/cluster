"use client"

import { useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { CheckIcon, CopyIcon } from "lucide-react"
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
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  adminApi,
  type AccessGrant,
  type AccessKind,
  type Member,
} from "@/lib/admin-api"
import {
  accessKindsFor,
  DEFAULT_LIFETIME,
  LIFETIME_PRESETS,
} from "@/lib/access-lifetimes"
import { getErrorMessage } from "@/lib/api"

/**
 * An access link or an initial password for one member, shown once (docs/specs/auth/access-without-mail).
 * The secret is not kept anywhere after this dialog closes.
 */
export function AccessDialog({
  member,
  initialKind = "link",
  mailEnabled,
  onOpenChange,
}: {
  member: Member
  initialKind?: AccessKind
  mailEnabled: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("settings.members.access")
  const locale = useLocale()
  const pending = member.invitationPending
  const purpose = pending ? "INVITE" : "RESET"
  const presets: readonly number[] = LIFETIME_PRESETS[purpose]
  const name = `${member.firstName} ${member.lastName}`
  const [kind, setKind] = useState<AccessKind>(initialKind)
  const [lifetime, setLifetime] = useState<number>(DEFAULT_LIFETIME[purpose])
  const [grant, setGrant] = useState<AccessGrant | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const lifetimeLabel = (hours: number) =>
    hours % 24 === 0
      ? t("lifetime.days", { count: hours / 24 })
      : t("lifetime.hours", { count: hours })

  async function create() {
    setSaving(true)
    setError(null)
    try {
      setGrant(await adminApi.issueAccess(member.id, { kind, lifetime }))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const value = grant?.url ?? grant?.password ?? ""

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success(t("copied"))
    } catch {
      toast.error(t("copyFailed"))
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title", { name })}</DialogTitle>
          <DialogDescription>
            {!mailEnabled
              ? t("bodyNoMail")
              : pending
                ? t("bodyMail")
                : t("bodyReset", { name })}
          </DialogDescription>
        </DialogHeader>

        {grant ? (
          <>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="access-value">
                  {grant.url ? t("kind.link") : t("kind.password")}
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="access-value"
                    readOnly
                    value={value}
                    className="font-mono text-sm"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button type="button" variant="outline" onClick={copy}>
                    {copied ? (
                      <CheckIcon data-icon="inline-start" />
                    ) : (
                      <CopyIcon data-icon="inline-start" />
                    )}
                    {copied ? t("copiedButton") : t("copy")}
                  </Button>
                </div>
              </Field>
              <p className="text-sm text-muted-foreground">
                {t("validUntil", {
                  date: new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(new Date(grant.expiresAt)),
                })}
              </p>
              <p className="text-sm font-medium text-foreground">
                {t("notAgain")}
              </p>
            </FieldGroup>
            <DialogFooter>
              <Button type="button" onClick={() => onOpenChange(false)}>
                {t("done")}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <FieldGroup>
              {pending && (
                <Field>
                  <FieldLabel htmlFor="access-kind">
                    {t("kindLabel")}
                  </FieldLabel>
                  <Select
                    value={kind}
                    onValueChange={(v) => setKind(v as AccessKind)}
                  >
                    <SelectTrigger id="access-kind" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {accessKindsFor(pending).map((k) => (
                        <SelectItem key={k} value={k}>
                          {t(`kind.${k}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field>
                <FieldLabel htmlFor="access-lifetime">
                  {t("lifetimeLabel")}
                </FieldLabel>
                <Select
                  value={String(lifetime)}
                  onValueChange={(v) => setLifetime(Number(v))}
                >
                  <SelectTrigger id="access-lifetime" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {presets.map((hours) => (
                      <SelectItem key={hours} value={String(hours)}>
                        {lifetimeLabel(hours)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </FieldGroup>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving && <Spinner data-icon="inline-start" />}
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
