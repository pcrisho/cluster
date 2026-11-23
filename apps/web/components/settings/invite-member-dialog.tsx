"use client"

import { useEffect, useMemo, useState } from "react"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { adminApi, type Member } from "@/lib/admin-api"
import { getErrorMessage, type UserRole } from "@/lib/api"
import { useAuth } from "@/lib/auth-context"
import { orgApi, type Position } from "@/lib/org-api"
import { areaPathLabel } from "@/lib/partition"
import { useOrgNodes } from "@/hooks/use-org-nodes"
import { usePositions } from "@/hooks/use-positions"
import { useTranslations } from "next-intl"

export const ROLES: UserRole[] = ["ADMIN", "MANAGER", "COLLABORATOR"]

const NO_AREA = "__none__"
const NO_POSITION = "__none__"

export function InviteMemberDialog({
  open,
  onOpenChange,
  onInvited,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** mailEnabled false: the member exists and the caller offers an access link instead. */
  onInvited: (member: Member, mailEnabled: boolean) => void
}) {
  const tc = useTranslations("common")
  const tr = useTranslations("common.roles")
  const t = useTranslations("settings.members")
  const ta = useTranslations("settings.assignment")
  const { user } = useAuth()
  const isolated = user?.organization.isolated ?? false
  const { nodes } = useOrgNodes()
  const { positions: allPositions } = usePositions()
  const [email, setEmail] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [role, setRole] = useState<UserRole>("COLLABORATOR")
  const [orgNodeId, setOrgNodeId] = useState<string | null>(null)
  const [positionId, setPositionId] = useState(NO_POSITION)
  const [areaError, setAreaError] = useState<string | null>(null)
  // The positions of the chosen area (global ones included), tagged with the area they came for.
  const [scoped, setScoped] = useState<{
    nodeId: string
    positions: Position[]
  } | null>(null)
  const [saving, setSaving] = useState(false)

  const areaLabels = useMemo(
    () =>
      new Map(nodes.map((n) => [n.id, { name: n.name, parentId: n.parentId }])),
    [nodes]
  )
  // While main nodes are isolated a collaborator must have an area (their main node decides what they see).
  const nodeRequired = isolated && role === "COLLABORATOR"
  const showAreaError = nodeRequired && areaError !== null
  const positionChoices = orgNodeId
    ? scoped?.nodeId === orgNodeId
      ? scoped.positions
      : []
    : allPositions.filter((p) => p.orgNodeId === null)

  useEffect(() => {
    if (!orgNodeId) return
    let stale = false
    orgApi
      .getPositionsForArea(orgNodeId)
      .then((res) => {
        if (!stale) setScoped({ nodeId: orgNodeId, positions: res.data })
      })
      .catch((e) => toast.error(getErrorMessage(e)))
    return () => {
      stale = true
    }
  }, [orgNodeId])

  function chooseArea(nodeId: string | null) {
    setOrgNodeId(nodeId)
    setPositionId(NO_POSITION)
    setAreaError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (nodeRequired && !orgNodeId) {
      setAreaError(t("areaRequiredError"))
      return
    }
    setSaving(true)
    try {
      const { member, inviteSent, mailEnabled } = await adminApi.createMember({
        email,
        firstName,
        lastName,
        role,
        orgNodeId: orgNodeId ?? undefined,
        positionId: positionId === NO_POSITION ? undefined : positionId,
      })
      onInvited(member, mailEnabled)
      if (inviteSent) toast.success(t("inviteSent", { email: member.email }))
      else if (mailEnabled) toast.warning(t("createdNoEmail"))
      setEmail("")
      setFirstName("")
      setLastName("")
      setRole("COLLABORATOR")
      chooseArea(null)
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit} className="contents">
          <DialogHeader>
            <DialogTitle>{t("inviteTitle")}</DialogTitle>
            <DialogDescription>{t("inviteDescription")}</DialogDescription>
          </DialogHeader>
          <FieldGroup>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="invite-first">{t("firstName")}</FieldLabel>
                <Input
                  id="invite-first"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  maxLength={100}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="invite-last">{t("lastName")}</FieldLabel>
                <Input
                  id="invite-last"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  maxLength={100}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="invite-email">{t("email")}</FieldLabel>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">{t("role")}</FieldLabel>
              <Select
                value={role}
                onValueChange={(v) => setRole(v as UserRole)}
              >
                <SelectTrigger id="invite-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {tr(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field data-invalid={showAreaError}>
              <FieldLabel htmlFor="invite-area">
                {ta("area")}
                {nodeRequired && (
                  <span aria-hidden="true" className="text-destructive">
                    {" *"}
                  </span>
                )}
              </FieldLabel>
              <Select
                value={orgNodeId ?? NO_AREA}
                onValueChange={(v) => chooseArea(v === NO_AREA ? null : v)}
              >
                <SelectTrigger
                  id="invite-area"
                  className="w-full"
                  aria-invalid={showAreaError}
                >
                  <SelectValue placeholder={t("noArea")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_AREA}>{t("noArea")}</SelectItem>
                  {nodes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {areaPathLabel(n.id, areaLabels)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription
                className={showAreaError ? "text-destructive" : undefined}
              >
                {showAreaError
                  ? areaError
                  : nodeRequired
                    ? t("areaRequiredHint")
                    : t("areaHint")}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-position">
                {ta("position")}
              </FieldLabel>
              <Select value={positionId} onValueChange={setPositionId}>
                <SelectTrigger id="invite-position" className="w-full">
                  <SelectValue placeholder={ta("noPosition")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_POSITION}>
                    {ta("noPosition")}
                  </SelectItem>
                  {positionChoices.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Spinner data-icon="inline-start" />}
              {t("sendInvite")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
