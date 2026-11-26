"use client"

import { UsersIcon } from "lucide-react"

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { useTranslations } from "next-intl"

interface DirectoryEmptyProps {
  hasSearch: boolean
  searchTerm: string
  hasFilters?: boolean
}

export function DirectoryEmpty({
  hasSearch,
  searchTerm,
  hasFilters,
}: DirectoryEmptyProps) {
  const t = useTranslations("connect.directory")
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <UsersIcon />
        </EmptyMedia>
        <EmptyTitle>{t("noMembers")}</EmptyTitle>
        <EmptyDescription>
          {hasFilters
            ? t("noMatchFilters")
            : hasSearch
              ? t("noMatchSearch", { term: searchTerm ?? "" })
              : t("noMembersInTeam")}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
