"use client"

import * as React from "react"
import { toast } from "sonner"

import { orgApi, type Position } from "@/lib/org-api"
import { getErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { ColorPicker } from "@/components/shared/color-picker"
import { OrgNodePicker } from "@/components/shared/org-node-picker"
import { useTranslations } from "next-intl"

interface PositionFormData {
  name: string
  description: string
  color: string | null
  orgNodeId: string | null
}

const EMPTY_FORM: PositionFormData = {
  name: "",
  description: "",
  color: null,
  orgNodeId: null,
}

interface PositionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Si se pasa, el dialog es de edicion. Si no, es de creacion. */
  position?: Position | null
  /**
   * Nodo donde se pre-selecciona el picker al abrir (en creacion).
   * Si es null, default Global.
   * En edicion se ignora: se usa position.orgNodeId.
   */
  defaultOrgNodeId?: string | null
  onSuccess: () => void
}

export function PositionDialog({
  open,
  onOpenChange,
  position,
  defaultOrgNodeId,
  onSuccess,
}: PositionDialogProps) {
  const tc = useTranslations("common")
  const t = useTranslations("settings.positionDialog")
  const isEdit = Boolean(position)
  const [form, setForm] = React.useState<PositionFormData>(EMPTY_FORM)
  const [busy, setBusy] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)

  // Reset form when opening
  React.useEffect(() => {
    if (!open) return
    queueMicrotask(() => {
      if (position) {
        setForm({
          name: position.name,
          description: position.description ?? "",
          color: position.color ?? null,
          orgNodeId: position.orgNodeId ?? null,
        })
      } else {
        setForm({
          ...EMPTY_FORM,
          orgNodeId: defaultOrgNodeId ?? null,
        })
      }
      setNameError(null)
    })
  }, [open, position, defaultOrgNodeId])

  function validateName(name: string): string | null {
    const trimmed = name.trim()
    if (trimmed.length < 2) return t("minLength")
    return null
  }

  function handleNameChange(value: string) {
    setForm((f) => ({ ...f, name: value }))
    setNameError(validateName(value))
  }

  async function handleSubmit() {
    const nameErr = validateName(form.name)
    if (nameErr) {
      setNameError(nameErr)
      return
    }

    setBusy(true)
    try {
      if (isEdit && position) {
        await orgApi.updatePosition(position.id, {
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          color: form.color,
          orgNodeId: form.orgNodeId,
        })
        toast.success(t("updated"))
      } else {
        await orgApi.createPosition({
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          color: form.color ?? undefined,
          orgNodeId: form.orgNodeId,
        })
        toast.success(t("created"))
      }
      onSuccess()
      onOpenChange(false)
    } catch (e) {
      toast.error(getErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("editTitle") : t("newTitle")}</DialogTitle>
          <DialogDescription>
            {isEdit ? t("editDescription") : t("newDescription")}
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("area")}</FieldLabel>
            <OrgNodePicker
              value={form.orgNodeId}
              onChange={(nodeId) =>
                setForm((f) => ({ ...f, orgNodeId: nodeId }))
              }
              disabled={busy}
            />
            <FieldDescription>{t("areaHint")}</FieldDescription>
          </Field>
          <Field data-invalid={!!nameError}>
            <FieldLabel>{t("name")}</FieldLabel>
            <Input
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder={t("namePlaceholder")}
              disabled={busy}
              aria-invalid={!!nameError}
            />
            {nameError && (
              <FieldDescription className="text-destructive">
                {nameError}
              </FieldDescription>
            )}
          </Field>
          <Field>
            <FieldLabel>{t("description")}</FieldLabel>
            <Textarea
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
              placeholder={t("descriptionPlaceholder")}
              disabled={busy}
              rows={3}
            />
          </Field>
          <Field>
            <FieldLabel>{t("color")}</FieldLabel>
            <ColorPicker
              value={form.color}
              onChange={(c) => setForm((f) => ({ ...f, color: c }))}
              disabled={busy}
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            {tc("cancel")}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={busy || !!nameError || !form.name.trim()}
          >
            {busy && <Spinner data-icon="inline-start" />}
            {isEdit ? tc("saveChanges") : t("create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
