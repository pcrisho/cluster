"use client"

import { SearchIcon } from "lucide-react"

import { UserAssignmentTreePanel } from "@/components/settings/user-assignment-tree-panel"
import { useMembers } from "@/hooks/use-members"
import { PageContainer, PageHeader } from "@/components/layout/page"
import { RequireAdmin } from "@/components/shared/require-admin"
import { StatusBadge } from "@/components/ui/status-badge"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group"
import { useTranslations } from "next-intl"

export default function AssignmentsPage() {
  return (
    <PageContainer width="full">
      <RequireAdmin>
        <AssignmentsContent />
      </RequireAdmin>
    </PageContainer>
  )
}

function AssignmentsContent() {
  const t = useTranslations("settings.pages")
  const directory = useMembers()
  const { stats } = directory

  return (
    <>
      <PageHeader
        title={t("assignmentsTitle")}
        description={t("assignmentsDescription")}
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <InputGroup className="w-full sm:w-64">
          <InputGroupAddon align="inline-start">
            <SearchIcon />
          </InputGroupAddon>
          <InputGroupInput
            placeholder={t("searchPeople")}
            aria-label={t("searchPeople")}
            value={directory.search}
            onChange={(e) => directory.setSearch(e.target.value)}
          />
        </InputGroup>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t("total", { count: stats.total })}
          </span>
          <StatusBadge tone="success" variant="dot">
            <span className="tabular-nums">
              {t("assigned", { count: stats.assigned })}
            </span>
          </StatusBadge>
          {stats.unassigned > 0 && (
            <StatusBadge tone="warning" variant="dot">
              <span className="tabular-nums">
                {t("unassigned", { count: stats.unassigned })}
              </span>
            </StatusBadge>
          )}
        </div>
      </div>
      <UserAssignmentTreePanel
        search={directory.search}
        onSearchChange={directory.setSearch}
      />
    </>
  )
}
