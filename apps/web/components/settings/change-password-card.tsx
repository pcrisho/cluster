"use client"

import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { PasswordInput } from "@/components/shared/password-input"
import { adminApi } from "@/lib/admin-api"
import { getErrorMessage } from "@/lib/api"
import { useTranslations } from "next-intl"

export function ChangePasswordCard() {
  const t = useTranslations("settings.password")
  const tv = useTranslations("auth.validation")
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await adminApi.changePassword(currentPassword, newPassword)
      setCurrentPassword("")
      setNewPassword("")
      toast.success(t("updated"))
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="max-w-sm">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="current-password">{t("current")}</FieldLabel>
              <PasswordInput
                id="current-password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-password">{t("new")}</FieldLabel>
              <PasswordInput
                id="new-password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                showStrength
                required
                minLength={12}
              />
              <FieldDescription>{tv("passwordRule")}</FieldDescription>
            </Field>
            <Button
              type="submit"
              className="self-start"
              disabled={saving || !currentPassword || !newPassword}
            >
              {saving && <Spinner data-icon="inline-start" />}
              {t("submit")}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
