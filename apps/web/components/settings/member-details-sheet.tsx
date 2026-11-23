"use client"

import { useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

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
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Spinner } from "@/components/ui/spinner"
import { PhoneInput } from "@/components/shared/phone-input"
import { adminApi, type Member, type MemberUpdate } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"

/** `YYYY-MM-DD` of a day the API stores at UTC midnight. */
const day = (iso: string | null | undefined) => iso?.slice(0, 10) ?? ""

function initialOf(member: Member) {
  return {
    firstName: member.firstName,
    lastName: member.lastName,
    email: member.email,
    employeeCode: member.employeeCode ?? "",
    phone: member.profile?.phone ?? "",
    birthDate: day(member.profile?.birthDate),
    joinedAt: day(member.profile?.joinedAt ?? member.createdAt),
  }
}
type Form = ReturnType<typeof initialOf>

/** The fields that changed, as the API takes them (empty optional fields clear). */
function changesOf(initial: Form, form: Form): MemberUpdate {
  const changes: MemberUpdate = {}
  for (const key of Object.keys(form) as (keyof Form)[]) {
    const value = form[key].trim()
    if (value === initial[key]) continue
    if (key === "employeeCode" || key === "phone" || key === "birthDate") {
      changes[key] = value || null
    } else {
      changes[key] = value
    }
  }
  return changes
}

/** ADMIN edits a member's personal data (docs/specs/org/member-data). Keyed by member, so it starts fresh. */
export function MemberDetailsSheet({
  member,
  onOpenChange,
  onSaved,
}: {
  member: Member
  onOpenChange: (open: boolean) => void
  onSaved: (member: Member) => void
}) {
  const tc = useTranslations("common")
  const t = useTranslations("settings.members.details")
  const tm = useTranslations("settings.members")
  const [initial] = useState(() => initialOf(member))
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [confirmEmail, setConfirmEmail] = useState(false)
  const today = new Date().toISOString().slice(0, 10)
  const changes = changesOf(initial, form)
  const dirty = Object.keys(changes).length > 0
  const set = (key: keyof Form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }))

  async function save() {
    setSaving(true)
    try {
      onSaved(await adminApi.updateMember(member.id, changes))
      toast.success(tm("updated"))
      onOpenChange(false)
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (changes.email) setConfirmEmail(true)
    else void save()
  }

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <SheetHeader>
            <SheetTitle>{t("title")}</SheetTitle>
            <SheetDescription>
              {t("description", {
                name: `${member.firstName} ${member.lastName}`,
              })}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4">
            <FieldGroup>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="member-first">
                    {tm("firstName")}
                  </FieldLabel>
                  <Input
                    id="member-first"
                    value={form.firstName}
                    onChange={(e) => set("firstName")(e.target.value)}
                    required
                    maxLength={100}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="member-last">
                    {tm("lastName")}
                  </FieldLabel>
                  <Input
                    id="member-last"
                    value={form.lastName}
                    onChange={(e) => set("lastName")(e.target.value)}
                    required
                    maxLength={100}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="member-email">{tm("email")}</FieldLabel>
                <Input
                  id="member-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email")(e.target.value)}
                  required
                />
                <FieldDescription>{t("emailHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="member-code">
                  {t("employeeCode")}
                </FieldLabel>
                <Input
                  id="member-code"
                  value={form.employeeCode}
                  onChange={(e) => set("employeeCode")(e.target.value)}
                  maxLength={50}
                />
                <FieldDescription>{t("employeeCodeHint")}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="member-phone">{t("phone")}</FieldLabel>
                <PhoneInput
                  id="member-phone"
                  value={form.phone}
                  onChange={set("phone")}
                />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="member-birth">
                    {t("birthDate")}
                  </FieldLabel>
                  <Input
                    id="member-birth"
                    type="date"
                    value={form.birthDate}
                    max={today}
                    onChange={(e) => set("birthDate")(e.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="member-joined">
                    {t("joinedAt")}
                  </FieldLabel>
                  <Input
                    id="member-joined"
                    type="date"
                    value={form.joinedAt}
                    max={today}
                    onChange={(e) => set("joinedAt")(e.target.value)}
                    required
                  />
                </Field>
              </div>
            </FieldGroup>
          </div>
          <SheetFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              {tc("cancel")}
            </Button>
            <Button type="submit" disabled={saving || !dirty}>
              {saving && <Spinner data-icon="inline-start" />}
              {tc("saveChanges")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>

      <AlertDialog open={confirmEmail} onOpenChange={setConfirmEmail}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("emailConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("emailConfirmBody", {
                name: `${member.firstName} ${member.lastName}`,
                email: form.email.trim(),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void save()}>
              {t("emailConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  )
}
