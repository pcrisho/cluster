"use client"

import { useState, useEffect, useCallback } from "react"
import { GlobeIcon } from "lucide-react"
import { toast } from "sonner"

import type { Member } from "@/lib/admin-api"
import { orgApi, type Position } from "@/lib/org-api"
import { usePositions } from "@/hooks/use-positions"
import { getErrorMessage } from "@/lib/api"
import { peopleMovingPartition, type FlatArea } from "@/lib/partition-moves"
import type { AskPartition } from "@/components/settings/partition-move-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
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
  SelectGroup,
  SelectLabel,
} from "@/components/ui/select"
import { OrgNodePicker } from "@/components/shared/org-node-picker"
import { useTranslations } from "next-intl"

const NONE = "__none__"

interface AssignmentSheetProps {
  user: Member | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
  /** The areas, the switch and the confirmation of a move that changes someone's main node. */
  nodes: FlatArea[]
  isolated: boolean
  ask: AskPartition
}

/**
 * Shared assignment Sheet for the org-assign page.
 * Used by both the tree view and any future view that needs
 * to edit a user's org area + position.
 */
export function AssignmentSheet({
  user,
  open,
  onOpenChange,
  onSuccess,
  nodes,
  isolated,
  ask,
}: AssignmentSheetProps) {
  const tc = useTranslations("common")
  const t = useTranslations("settings.assignment")
  const { positions: allPositions } = usePositions()
  const [selectedOrgNodeId, setSelectedOrgNodeId] = useState<string | null>(
    null
  )
  const [selectedPositionId, setSelectedPositionId] = useState<string>(NONE)
  const [scopedAvailable, setScopedAvailable] = useState<Position[]>([])
  const [isLoadingPositions, setIsLoadingPositions] = useState(false)

  useEffect(() => {
    if (!user) {
      queueMicrotask(() => {
        setSelectedOrgNodeId(null)
        setSelectedPositionId(NONE)
        setScopedAvailable([])
      })
      return
    }
    const initialOrgNodeId = user.profile?.orgNode?.id ?? null
    const initialPositionId = user.profile?.position?.id ?? NONE
    queueMicrotask(() => {
      setSelectedOrgNodeId(initialOrgNodeId)
      setSelectedPositionId(initialPositionId)
    })

    if (initialOrgNodeId) {
      queueMicrotask(() => setIsLoadingPositions(true))
      orgApi
        .getPositionsForArea(initialOrgNodeId)
        .then((res) => setScopedAvailable(res.data))
        .finally(() => setIsLoadingPositions(false))
    } else {
      queueMicrotask(() => setScopedAvailable([]))
    }
  }, [user])

  // When the area changes, refresh the list of positions scoped to it.
  // A `null` area (Global) still allows picking a global position, so
  // we don't block the position field in that case — we just have no
  // area-scoped positions to add on top of the global ones.
  useEffect(() => {
    if (!user) return
    if (!selectedOrgNodeId) {
      queueMicrotask(() => {
        setScopedAvailable([])
        // If the previously selected position was scoped to an area
        // (not global), it's no longer valid once area is cleared.
        setSelectedPositionId((prev) => {
          if (prev === NONE) return prev
          const stillValid = allPositions.some(
            (p) => p.id === prev && p.orgNodeId === null
          )
          return stillValid ? prev : NONE
        })
      })
      return
    }
    queueMicrotask(() => setIsLoadingPositions(true))
    orgApi
      .getPositionsForArea(selectedOrgNodeId)
      .then((res) => {
        setScopedAvailable(res.data)
        if (
          selectedPositionId !== NONE &&
          !res.data.find((p) => p.id === selectedPositionId)
        ) {
          setSelectedPositionId(NONE)
        }
      })
      .finally(() => setIsLoadingPositions(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOrgNodeId])

  const [isSaving, setIsSaving] = useState(false)

  const handleSave = useCallback(() => {
    if (!user) return
    const apply = async () => {
      setIsSaving(true)
      try {
        await orgApi.setAssignment(user.id, {
          orgNodeId: selectedOrgNodeId,
          positionId: selectedPositionId === NONE ? null : selectedPositionId,
        })
        toast.success(t("updated"))
        onSuccess()
        onOpenChange(false)
      } catch (e) {
        toast.error(getErrorMessage(e))
      } finally {
        setIsSaving(false)
      }
    }
    ask(
      peopleMovingPartition(
        nodes,
        {
          kind: "person",
          fromNodeId: user.profile?.orgNode?.id ?? null,
          toNodeId: selectedOrgNodeId,
        },
        isolated
      ),
      () => void apply()
    )
  }, [
    user,
    nodes,
    isolated,
    ask,
    selectedOrgNodeId,
    selectedPositionId,
    onSuccess,
    onOpenChange,
    t,
  ])

  // When an area is selected: `scopedAvailable` already contains
  // both the area-scoped positions and the global ones (API returns
  // both). When no area is selected (Global): only global positions
  // from the full catalog are selectable.
  const scopedPositions = selectedOrgNodeId
    ? scopedAvailable.filter((p) => p.orgNodeId !== null)
    : []
  const globalPositions = selectedOrgNodeId
    ? scopedAvailable.filter((p) => p.orgNodeId === null)
    : allPositions.filter((p) => p.orgNodeId === null && p.isActive)

  const hasExistingAssignment = Boolean(
    user?.profile?.orgNode || user?.profile?.position
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t("title")}</SheetTitle>
          <SheetDescription>
            {user ? `${user.firstName} ${user.lastName}` : ""}
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
          <FieldGroup>
            <Field>
              <FieldLabel>{t("area")}</FieldLabel>
              <OrgNodePicker
                value={selectedOrgNodeId}
                onChange={setSelectedOrgNodeId}
                disabled={isSaving}
                // While main nodes are isolated a collaborator keeps an area (the API answers NODE_REQUIRED).
                allowGlobal={!(isolated && user?.role === "COLLABORATOR")}
              />
              <FieldDescription>{t("areaHint")}</FieldDescription>
            </Field>
            <Field data-disabled={isLoadingPositions}>
              <FieldLabel htmlFor="position">{t("position")}</FieldLabel>
              <Select
                value={selectedPositionId}
                onValueChange={setSelectedPositionId}
                disabled={isSaving || isLoadingPositions}
              >
                <SelectTrigger id="position">
                  <SelectValue placeholder={t("pickPosition")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value={NONE}>{t("noPosition")}</SelectItem>
                  </SelectGroup>
                  {scopedPositions.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>{t("fromArea")}</SelectLabel>
                      {scopedPositions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  {globalPositions.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="flex items-center gap-1">
                        <GlobeIcon className="size-3" />
                        {t("global")}
                      </SelectLabel>
                      {globalPositions.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
              {isLoadingPositions ? (
                <FieldDescription className="flex items-center gap-1">
                  <Spinner className="size-3" />
                  {t("loadingPositions")}
                </FieldDescription>
              ) : scopedPositions.length === 0 &&
                globalPositions.length === 0 ? (
                <FieldDescription>
                  {selectedOrgNodeId
                    ? t("noneAvailableArea")
                    : t("noneAvailable")}
                </FieldDescription>
              ) : (
                <FieldDescription>{t("positionsHint")}</FieldDescription>
              )}
            </Field>
          </FieldGroup>
        </div>
        <SheetFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {tc("cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaving}>
            {isSaving && <Spinner data-icon="inline-start" />}
            {hasExistingAssignment ? t("reassign") : t("assign")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
