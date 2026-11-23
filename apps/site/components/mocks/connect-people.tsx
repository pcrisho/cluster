import {
  GitBranchIcon,
  LayoutGridIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  Table2Icon,
  UsersIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { AppWindow } from "@/components/app-frame"
import { demoPeople } from "@/components/fixtures"
import { MockStage, type MockFocus } from "@/components/mock-stage"
import { ScaledScreen } from "@/components/scaled-screen"

function DirectoryAvatar({ initials }: { initials: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium text-muted-foreground">
      {initials}
    </span>
  )
}

function OrgNode({
  area,
  count,
  person,
  role,
}: {
  area: string
  count: string
  person: string
  role: string
}) {
  return (
    <div className="flex min-h-18 flex-col justify-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {area}
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <UsersIcon className="size-3.5" aria-hidden />
          {count}
        </span>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-3xs font-medium">
          {person
            .split(" ")
            .map((part) => part[0])
            .join("")}
        </span>
        <span className="truncate">
          {person} · {role}
        </span>
      </div>
    </div>
  )
}

export function ConnectPeopleMock({
  focus,
  width,
}: {
  focus?: MockFocus
  width?: number
}) {
  const t = useTranslations("mocks.connect")
  const chrome = useTranslations("mocks.chrome")
  const alt = useTranslations("mocks")
  const data = useTranslations("mocks.data")

  const people = demoPeople.slice(0, 4)

  return (
    <MockStage description={alt("connectAlt")} focus={focus}>
      <ScaledScreen width={width}>
        <AppWindow
          crumbs={[
            { label: chrome("connectCrumb") },
            { label: t("directoryTitle"), current: true },
          ]}
        >
          <div className="relative overflow-hidden bg-background p-6 xl:min-h-[580px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold tracking-tight text-foreground">
                  {t("directoryTitle")}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("directoryDescription")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm text-muted-foreground tabular-nums">
                  {t("directoryCount")}
                </span>
                <span className="flex h-8 items-center rounded-lg border border-input">
                  <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    <Table2Icon className="size-4" aria-hidden />
                  </span>
                  <span className="flex size-8 items-center justify-center text-muted-foreground">
                    <LayoutGridIcon className="size-4" aria-hidden />
                  </span>
                  <span className="flex size-8 items-center justify-center text-muted-foreground">
                    <GitBranchIcon className="size-4" aria-hidden />
                  </span>
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-2">
              <span className="flex h-8 w-72 items-center gap-2 rounded-lg border border-input px-3 text-sm text-muted-foreground">
                <SearchIcon className="size-4 shrink-0" aria-hidden />
                {t("search")}
              </span>
              <span className="flex h-8 items-center gap-2 rounded-lg border border-input px-3 text-sm text-foreground">
                <span className="text-base leading-none" aria-hidden>
                  +
                </span>
                {t("addFilter")}
              </span>
              <span className="ml-auto hidden h-8 items-center gap-2 rounded-lg border border-input px-3 text-sm text-foreground sm:flex">
                <SlidersHorizontalIcon className="size-4" aria-hidden />
                {t("columns")}
              </span>
            </div>

            <div className="relative mt-5 overflow-hidden rounded-lg border border-border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 bg-background text-left text-xs font-medium text-muted-foreground">
                  <tr className="h-10 border-b border-border">
                    <th className="w-2/5 px-2 font-medium">
                      {t("memberHeading")}
                    </th>
                    <th className="px-2 font-medium">{t("positionHeading")}</th>
                    <th className="px-2 font-medium">{t("areaHeading")}</th>
                  </tr>
                </thead>
                <tbody>
                  {people.map((person, index) => (
                    <tr
                      className="h-12 border-b border-border last:border-0"
                      key={person.initials}
                    >
                      <td className="px-2">
                        <div className="flex items-center gap-3">
                          <DirectoryAvatar initials={person.initials} />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {person.name}
                            </div>
                            <div className="truncate text-xs text-muted-foreground">
                              {t(`person${index + 1}Role`)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 text-foreground">
                        {data(`positions.${person.key}`)}
                      </td>
                      <td className="px-2 text-muted-foreground">
                        {data(`areas.${person.area}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex h-12 items-center justify-between border-t border-border bg-background px-3 text-sm text-muted-foreground">
                <span>{t("results")}</span>
                <span className="flex items-center gap-5 text-foreground">
                  {t("pager")}
                </span>
              </div>
            </div>

            <div className="absolute top-56 right-10 z-10 hidden w-112 rounded-xl border border-border bg-card p-4 shadow-xl xl:block">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <span className="text-sm font-semibold text-foreground">
                  {t("chartTitle")}
                </span>
                <span className="flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs text-muted-foreground">
                  <GitBranchIcon className="size-3.5" aria-hidden />
                  {t("topDown")}
                </span>
              </div>
              <div className="flex flex-col items-center gap-3 pt-4">
                <OrgNode
                  area={data("areas.engineering")}
                  count={t("subtreeCount")}
                  person={demoPeople[0].name}
                  role={data("positions.ana")}
                />
                <div className="h-5 border-l border-border" />
                <div className="grid w-full grid-cols-2 gap-3">
                  <OrgNode
                    area={t("chartTeam1")}
                    count={t("reportsCount")}
                    person={demoPeople[1].name}
                    role={data("positions.diego")}
                  />
                  <OrgNode
                    area={t("chartTeam2")}
                    count="1"
                    person={demoPeople[2].name}
                    role={data("positions.lucia")}
                  />
                </div>
              </div>
            </div>
          </div>
        </AppWindow>
      </ScaledScreen>
    </MockStage>
  )
}
