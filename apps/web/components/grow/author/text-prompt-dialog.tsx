"use client"

import { useState } from "react"
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
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

interface TextPromptDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  label: string
  initialValue: string
  submitLabel: string
  onSubmit: (value: string) => Promise<void> | void
}

/** One text field in a dialog (renaming a section). */
export function TextPromptDialog({
  open,
  onOpenChange,
  ...props
}: TextPromptDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Keyed so the field starts from the current value each time it opens. */}
        {open && (
          <PromptForm
            key={props.initialValue}
            onClose={() => onOpenChange(false)}
            {...props}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function PromptForm({
  title,
  label,
  initialValue,
  submitLabel,
  onSubmit,
  onClose,
}: Omit<TextPromptDialogProps, "open" | "onOpenChange"> & {
  onClose: () => void
}) {
  const t = useTranslations("common")
  const [value, setValue] = useState(initialValue)
  const [busy, setBusy] = useState(false)

  return (
    <form
      className="contents"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!value.trim()) return
        setBusy(true)
        try {
          await onSubmit(value.trim())
          onClose()
        } finally {
          setBusy(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className="sr-only">{label}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="prompt-value">{label}</FieldLabel>
        <Input
          id="prompt-value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={200}
          autoFocus
        />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={busy || !value.trim()}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  )
}
