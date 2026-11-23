import type { ReactNode } from "react"
import {
  Building2Icon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  ContactRoundIcon,
  FileStackIcon,
  GraduationCapIcon,
  NewspaperIcon,
  SearchIcon,
  SettingsIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { demoLearner } from "../fixtures"

function NavRow({
  active,
  children,
  icon,
}: {
  active?: boolean
  children: ReactNode
  icon: ReactNode
}) {
  return (
    <div
      aria-current={active ? "page" : undefined}
      className={`flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 text-sm ${
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground"
      }`}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {icon}
      </span>
      <span className="truncate">{children}</span>
    </div>
  )
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <div className="flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70">
        {label}
      </div>
      {children}
    </div>
  )
}

export function AppSidebar() {
  const t = useTranslations("mocks.chrome")

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-2 text-sidebar-foreground xl:flex">
      <div className="flex h-12 items-center gap-2 rounded-lg px-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
          <Building2Icon className="size-4" aria-hidden />
        </span>
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate text-sm font-medium">
            {t("organization")}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {t("role")}
          </span>
        </span>
      </div>

      <div className="mt-2 flex h-8 items-center gap-2 rounded-md border border-sidebar-border bg-background px-2 text-sm text-muted-foreground">
        <SearchIcon className="size-4 shrink-0" aria-hidden />
        <span className="truncate">{t("search")}</span>
        <span className="ml-auto hidden rounded-sm bg-sidebar-accent px-1 text-xs font-medium text-muted-foreground md:inline-flex">
          {t("shortcut")}
        </span>
      </div>

      <nav
        aria-label={t("navigation")}
        className="mt-1 flex min-h-0 flex-1 flex-col"
      >
        <NavGroup label={t("connect")}>
          <NavRow icon={<NewspaperIcon className="size-4" aria-hidden />}>
            {t("feed")}
          </NavRow>
          <NavRow icon={<ContactRoundIcon className="size-4" aria-hidden />}>
            {t("directory")}
          </NavRow>
        </NavGroup>

        <NavGroup label={t("know")}>
          <NavRow icon={<FileStackIcon className="size-4" aria-hidden />}>
            {t("spaces")}
          </NavRow>
        </NavGroup>

        <NavGroup label={t("grow")}>
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <NavRow
                active
                icon={<GraduationCapIcon className="size-4" aria-hidden />}
              >
                {t("courses")}
              </NavRow>
            </div>
            <span className="relative mr-2 flex size-4 shrink-0 items-center justify-center">
              <span className="absolute -top-1.5 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-3xs font-medium text-background">
                1
              </span>
              <ChevronRightIcon
                className="size-3.5 text-muted-foreground"
                aria-hidden
              />
            </span>
          </div>
          <div className="ml-3.5 flex h-7 min-w-0 items-center gap-2 rounded-md border-l border-sidebar-border px-2.5 py-0.5 text-sm">
            <GraduationCapIcon className="size-4 shrink-0" aria-hidden />
            <span className="truncate">{t("courseTitle")}</span>
          </div>
        </NavGroup>
      </nav>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <NavRow icon={<SettingsIcon className="size-4" aria-hidden />}>
          {t("settings")}
        </NavRow>
        <div className="flex h-12 items-center gap-2 rounded-lg px-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs text-muted-foreground">
            {demoLearner.initials}
          </span>
          <span className="grid min-w-0 flex-1 text-left leading-tight">
            <span className="truncate text-sm font-medium">
              {demoLearner.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {demoLearner.email}
            </span>
          </span>
          <ChevronsUpDownIcon className="ml-auto size-4 shrink-0" aria-hidden />
        </div>
      </div>
    </aside>
  )
}
