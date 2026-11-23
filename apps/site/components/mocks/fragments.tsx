import {
  BadgeCheckIcon,
  ChevronDownIcon,
  FileDownIcon,
  GlobeIcon,
  NetworkIcon,
  UserIcon,
  XIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { demoPeople } from "@/components/fixtures"
import { MockStage, type MockFocus } from "@/components/mock-stage"
import { ReportsCard } from "./grow-dashboard"

// Pieces of real screens, at 1:1, for the small bento cells.

// The public page at /verify/<code>, as apps/web renders a valid certificate.
export function CertificateFragment({ focus }: { focus?: MockFocus }) {
  const t = useTranslations("mocks.fragments")
  const grow = useTranslations("mocks.grow")

  return (
    <MockStage description={t("certificateAlt")} focus={focus}>
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <BadgeCheckIcon className="size-9 text-success" aria-hidden />
          <div className="text-lg font-semibold text-foreground">
            {t("valid")}
          </div>
        </div>
        <dl className="mt-5 flex flex-col gap-2.5 text-sm">
          <div>
            <dt className="text-muted-foreground">{t("awardedTo")}</dt>
            <dd className="text-base font-medium text-foreground">
              {demoPeople[0].name}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("forCompleting")}</dt>
            <dd className="font-medium text-foreground">
              {grow("courseTitle")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("issued")}</dt>
            <dd className="font-medium text-foreground">{t("issuedOn")}</dd>
          </div>
        </dl>
        <p className="mt-5 font-mono text-xs text-muted-foreground">
          {t("issuedBy", { code: "7K3M-Q9XP" })}
        </p>
      </div>
    </MockStage>
  )
}

export function ReportsFragment({ focus }: { focus?: MockFocus }) {
  const t = useTranslations("mocks.fragments")

  return (
    <MockStage description={t("reportsAlt")} focus={focus}>
      <div className="min-w-[30rem]">
        <ReportsCard />
      </div>
    </MockStage>
  )
}

// A space's sharing, as apps/web's share dialog draws it: general access, then the people list.
export function AccessFragment({ focus }: { focus?: MockFocus }) {
  const t = useTranslations("mocks.fragments")
  const data = useTranslations("mocks.data")
  const ana = demoPeople[0]
  const rows = [
    {
      key: "area",
      icon: (
        <NetworkIcon className="size-4 text-muted-foreground" aria-hidden />
      ),
      name: data("areas.engineering"),
      kind: t("areaLabel"),
      role: t("editor"),
    },
    {
      key: "person",
      icon: <UserIcon className="size-4 text-muted-foreground" aria-hidden />,
      name: ana.name,
      kind: data("positions.ana"),
      role: t("manager"),
    },
  ]

  return (
    <MockStage description={t("accessAlt")} focus={focus}>
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-3 rounded-lg border border-border p-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <GlobeIcon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2 text-sm text-foreground">
              <span className="truncate">{t("everyone")}</span>
              <ChevronDownIcon
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </span>
            <span className="block text-xs text-muted-foreground">
              {t("openHint")}
            </span>
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="text-sm font-medium text-foreground">
            {t("peopleWithAccess")}
          </div>
          {rows.map((row) => (
            <div className="flex items-center gap-3 px-1 py-1.5" key={row.key}>
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                {row.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {row.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.kind}
                </span>
              </span>
              <span className="flex h-8 w-28 items-center justify-between rounded-lg border border-input px-2.5 text-sm text-foreground">
                {row.role}
                <ChevronDownIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              </span>
              <XIcon className="size-4 text-muted-foreground" aria-hidden />
            </div>
          ))}
        </div>
      </div>
    </MockStage>
  )
}

// The same page as the KNOW screen, as `GET /know/pages/:id/export` writes it.
export function MarkdownFragment({ focus }: { focus?: MockFocus }) {
  const t = useTranslations("mocks.fragments")
  const know = useTranslations("mocks.know")

  return (
    <MockStage description={t("markdownAlt")} focus={focus}>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex h-10 items-center gap-2 border-b border-border px-4 text-xs text-muted-foreground">
          <FileDownIcon className="size-4" aria-hidden />
          {t("exportLabel")}
        </div>
        <pre className="overflow-hidden p-4 font-mono text-xs leading-relaxed text-foreground">
          <span className="text-primary"># </span>
          {know("page")}
          {"\n\n"}
          <span className="text-primary">## </span>
          {know("beforeTag")}
          {"\n\n"}
          <span className="text-muted-foreground">- [x] </span>
          {know("done1")}
          {"\n"}
          <span className="text-muted-foreground">- [x] </span>
          {know("done2")}
          {"\n"}
          <span className="text-muted-foreground">- [ ] </span>
          {know("todo1")}
          {"\n"}
          <span className="text-muted-foreground">- [ ] </span>
          {know("todo2")}
        </pre>
      </div>
    </MockStage>
  )
}
