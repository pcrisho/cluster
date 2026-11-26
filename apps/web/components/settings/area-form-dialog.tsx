"use client"

import { useId, useState } from "react"
import {
  BriefcaseIcon,
  Building2Icon,
  CodeIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { orgApi, type OrgNode } from "@/lib/org-api"
import { getErrorCode, getErrorMessage } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { OrgNodePicker } from "@/components/shared/org-node-picker"
import {
  AreaManagerField,
  type AreaManager,
} from "@/components/settings/area-manager-field"

const ICON_REGISTRY: Record<string, LucideIcon> = {
  Building2: Building2Icon,
  Briefcase: BriefcaseIcon,
  Users: UsersIcon,
  Code: CodeIcon,
}
const ICON_OPTIONS = Object.keys(ICON_REGISTRY)
const NO_ICON = "__no_icon__"
/** Same rule as the API (after it trims and upper-cases). */
const CODE_FORMAT = /^[A-Z0-9._/-]{1,40}$/

/** What the dialog opens on; `key` is new on every open, so each open starts from a clean form. */
export interface AreaFormTarget {
  key: number
  /** The area being edited; null creates one. */
  editing: OrgNode | null
  /** Parent preselected on create (null: a main node). */
  parentId: string | null
}

interface AreaFormDialogProps {
  /** Null closes it; the last target stays on screen while the exit animation runs. */
  target: AreaFormTarget | null
  /** Every live area, to check names and place a new one last. */
  nodes: OrgNode[]
  onClose: () => void
  onSaved: () => void
}

/** Create or edit an area or main node. Always mounted, so the dialog can animate out. */
export function AreaFormDialog({
  target,
  nodes,
  onClose,
  onSaved,
}: AreaFormDialogProps) {
  const [shown, setShown] = useState(target)
  if (target && target !== shown) setShown(target)
  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {shown && (
          <AreaFormBody
            key={shown.key}
            editing={shown.editing}
            parentId={shown.parentId}
            nodes={nodes}
            onClose={onClose}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function AreaFormBody({
  editing,
  parentId: initialParentId,
  nodes,
  onClose,
  onSaved,
}: Omit<AreaFormDialogProps, "target"> & {
  editing: OrgNode | null
  parentId: string | null
}) {
  const tc = useTranslations("common")
  const t = useTranslations("settings.areas")
  const nameId = useId()
  const codeId = useId()
  const [name, setName] = useState(editing?.name ?? "")
  const [icon, setIcon] = useState(editing?.icon ?? NO_ICON)
  const [parentId, setParentId] = useState<string | null>(
    editing ? editing.parentId : initialParentId
  )
  const [manager, setManager] = useState<AreaManager | null>(
    editing?.manager
      ? {
          id: editing.manager.id,
          name: `${editing.manager.firstName} ${editing.manager.lastName}`,
        }
      : null
  )
  const [code, setCode] = useState(editing?.code ?? "")
  const [external, setExternal] = useState(editing?.external ?? false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [managerError, setManagerError] = useState<string | null>(null)
  const [codeError, setCodeError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isMain = parentId === null
  const codeInvalid = code.trim() !== "" && !CODE_FORMAT.test(code.trim())

  const validateName = (value: string, atParent: string | null) => {
    const trimmed = value.trim()
    if (trimmed.length < 2) return t("minLength")
    const taken = nodes.some(
      (n) =>
        n.id !== editing?.id &&
        n.parentId === atParent &&
        n.name.toLowerCase() === trimmed.toLowerCase()
    )
    return taken ? t("duplicate") : null
  }

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error(t("nameRequired"))
      return
    }
    const dup = validateName(name, parentId)
    if (dup) {
      setNameError(dup)
      return
    }
    setBusy(true)
    try {
      // Editing keeps the order; creating goes after the last sibling (max + 10).
      const maxSort = nodes
        .filter((n) => n.parentId === parentId && n.id !== editing?.id)
        .reduce((m, n) => Math.max(m, n.sortOrder), 0)
      const payload = {
        name: name.trim(),
        icon: icon === NO_ICON ? null : icon,
        sortOrder: editing ? editing.sortOrder : maxSort + 10,
        code: code.trim() || null,
        // Only a main node can be external (NODE_NOT_MAIN otherwise).
        external: isMain ? external : undefined,
      }
      if (editing) {
        await orgApi.updateArea(editing.id, {
          ...payload,
          managerId: manager?.id ?? null,
        })
        toast.success(t("updated"))
      } else {
        await orgApi.createArea({
          ...payload,
          parentId,
          managerId: manager?.id,
        })
        toast.success(t("created"))
      }
      onSaved()
    } catch (e) {
      const msg = getErrorMessage(e)
      const errorCode = getErrorCode(e)
      if (errorCode === "ORG_NODE_DUPLICATE_NAME") setNameError(msg)
      else if (errorCode === "ORG_MANAGER_BUSY") setManagerError(msg)
      else if (errorCode === "NODE_CODE_TAKEN") setCodeError(msg)
      else toast.error(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isMain
            ? editing
              ? t("editMainTitle")
              : t("newMainTitle")
            : editing
              ? t("editTitle")
              : t("newTitle")}
        </DialogTitle>
        <DialogDescription>
          {isMain
            ? editing
              ? t("editMainDescription")
              : t("newMainDescription")
            : editing
              ? t("editDescription")
              : t("newDescription")}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field data-invalid={!!nameError}>
          <FieldLabel htmlFor={nameId}>{t("name")}</FieldLabel>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setNameError(validateName(e.target.value, parentId))
            }}
            placeholder={t(isMain ? "mainNamePlaceholder" : "namePlaceholder")}
            disabled={busy}
            aria-invalid={!!nameError}
          />
          {nameError && (
            <FieldDescription className="text-destructive">
              {nameError}
            </FieldDescription>
          )}
        </Field>
        <Field data-invalid={!!codeError || codeInvalid}>
          <FieldLabel htmlFor={codeId}>{t("code")}</FieldLabel>
          <Input
            id={codeId}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase())
              setCodeError(null)
            }}
            maxLength={40}
            placeholder={t("codePlaceholder")}
            className="font-mono"
            disabled={busy}
            aria-invalid={!!codeError || codeInvalid}
          />
          {codeError || codeInvalid ? (
            <FieldDescription className="text-destructive">
              {codeError ?? t("codeHint")}
            </FieldDescription>
          ) : (
            <FieldDescription>{t("codeHint")}</FieldDescription>
          )}
        </Field>
        {isMain && (
          <Field>
            <FieldLabel>{t("kind")}</FieldLabel>
            <ToggleGroup
              type="single"
              variant="outline"
              spacing={0}
              value={external ? "external" : "internal"}
              onValueChange={(v) => v && setExternal(v === "external")}
              aria-label={t("kind")}
              disabled={busy}
              className="w-full [&>*]:flex-1"
            >
              <ToggleGroupItem value="internal">
                {t("internal")}
              </ToggleGroupItem>
              <ToggleGroupItem value="external">
                {t("external")}
              </ToggleGroupItem>
            </ToggleGroup>
            <FieldDescription>{t("kindHint")}</FieldDescription>
          </Field>
        )}
        <Field>
          <FieldLabel>{t("icon")}</FieldLabel>
          <Select value={icon} onValueChange={setIcon} disabled={busy}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("noIcon")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_ICON}>{t("noIcon")}</SelectItem>
              {ICON_OPTIONS.map((iconName) => {
                const Icon = ICON_REGISTRY[iconName]
                return (
                  <SelectItem key={iconName} value={iconName}>
                    <span className="flex items-center gap-2">
                      <Icon className="size-3.5 text-muted-foreground" />
                      {iconName}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </Field>
        <Field data-invalid={!!managerError}>
          <FieldLabel>{t("manager")}</FieldLabel>
          <AreaManagerField
            value={manager}
            onChange={(m) => {
              setManager(m)
              setManagerError(null)
            }}
            disabled={busy}
          />
          {managerError ? (
            <FieldDescription className="text-destructive">
              {managerError}
            </FieldDescription>
          ) : (
            <FieldDescription>{t("managerHint")}</FieldDescription>
          )}
        </Field>
        {!editing && (
          <Field>
            <FieldLabel>{t("parent")}</FieldLabel>
            <OrgNodePicker
              value={parentId}
              onChange={setParentId}
              disabled={busy}
            />
            <FieldDescription>{t("parentHint")}</FieldDescription>
          </Field>
        )}
      </FieldGroup>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          {tc("cancel")}
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={busy || !!nameError || codeInvalid || !name.trim()}
        >
          {busy ? <Spinner data-icon="inline-start" /> : null}
          {editing ? tc("save") : tc("create")}
        </Button>
      </DialogFooter>
    </>
  )
}
