import {
  BookOpenIcon,
  ChevronsUpDownIcon,
  EyeIcon,
  FileTextIcon,
  InfoIcon,
  MoreHorizontalIcon,
  PlusIcon,
  Share2Icon,
  UploadIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { AppWindow } from "@/components/app-frame"
import { demoPeople } from "@/components/fixtures"
import { MockStage, type MockFocus } from "@/components/mock-stage"
import { ScaledScreen } from "@/components/scaled-screen"

function PageTreeRow({
  active = false,
  children,
}: {
  active?: boolean
  children: string
}) {
  return (
    <div
      className={`flex h-8 items-center gap-2 rounded-md px-2 text-sm ${
        active
          ? "bg-accent font-medium text-accent-foreground"
          : "text-muted-foreground"
      }`}
    >
      <FileTextIcon className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {active && <MoreHorizontalIcon className="size-4 shrink-0" aria-hidden />}
    </div>
  )
}

function PersonAvatar({
  initials,
  label,
}: {
  initials: string
  label: string
}) {
  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-2xs font-medium text-muted-foreground"
      title={label}
    >
      {initials}
    </span>
  )
}

export function KnowPageMock({
  focus,
  width,
}: {
  focus?: MockFocus
  width?: number
}) {
  const t = useTranslations("mocks.know")
  const alt = useTranslations("mocks")
  const chrome = useTranslations("mocks.chrome")
  const ana = demoPeople[0]
  const diego = demoPeople[1]

  return (
    <MockStage description={alt("knowAlt")} focus={focus}>
      <ScaledScreen width={width}>
        <AppWindow
          crumbs={[
            { label: chrome("knowCrumb") },
            { label: chrome("spaces") },
            { label: t("space") },
            { label: t("page"), current: true },
          ]}
        >
          <div className="flex bg-background">
            <aside className="hidden w-72 shrink-0 flex-col gap-4 border-r border-border p-3 md:flex">
              <div className="flex h-8 items-center gap-2 rounded-lg border border-input px-2.5 text-sm text-foreground">
                <BookOpenIcon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 truncate">{t("space")}</span>
                <ChevronsUpDownIcon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden
                />
              </div>
              <div className="flex items-center justify-between px-2 text-xs font-medium tracking-wide text-muted-foreground">
                <span>{t("pagesLabel")}</span>
                <span className="flex items-center gap-1">
                  <UploadIcon className="size-3.5" aria-hidden />
                  <PlusIcon className="size-3.5" aria-hidden />
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <PageTreeRow>{t("incidentResponse")}</PageTreeRow>
                <PageTreeRow>{t("codeReview")}</PageTreeRow>
                <PageTreeRow>{t("onboarding")}</PageTreeRow>
                <PageTreeRow active>{t("releaseChecklist")}</PageTreeRow>
              </div>
            </aside>

            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex h-12 items-center justify-end gap-2 border-b border-border px-4 text-sm">
                <div className="flex items-center gap-1">
                  <PersonAvatar
                    initials={ana.initials}
                    label={t("presenceOne")}
                  />
                  <PersonAvatar
                    initials={diego.initials}
                    label={t("presenceTwo")}
                  />
                </div>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-foreground">
                  <EyeIcon className="size-4" aria-hidden />
                  {t("toolbarRead")}
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-foreground">
                  <InfoIcon className="size-4" aria-hidden />
                  {t("toolbarDetails")}
                </span>
                <span className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-2.5 text-foreground">
                  <Share2Icon className="size-4" aria-hidden />
                  {t("toolbarShare")}
                </span>
                <MoreHorizontalIcon
                  className="size-4 text-muted-foreground"
                  aria-hidden
                />
              </div>

              <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-5 px-6 pt-10 pb-8 md:px-10">
                <div className="text-sm text-muted-foreground">
                  {t("addIcon")}
                </div>
                <div className="text-4xl font-bold tracking-tight text-foreground">
                  {t("page")}
                </div>
                <div className="relative flex flex-col gap-5 text-base leading-relaxed text-foreground">
                  <p>{t("intro")}</p>
                  <p>{t("instructions")}</p>
                  <div className="absolute top-1 -right-2 rounded-md border border-cat-2 bg-card px-2 py-0.5 text-xs font-medium text-foreground shadow-xs">
                    {ana.name}
                  </div>
                  <div className="absolute top-12 left-1/3 rounded-md border border-cat-4 bg-card px-2 py-0.5 text-xs font-medium text-foreground shadow-xs">
                    {diego.name}
                  </div>
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="text-2xl font-semibold tracking-tight">
                      {t("beforeTag")}
                    </div>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-sm bg-primary text-3xs text-primary-foreground">
                        ✓
                      </span>
                      <span className="line-through">{t("done1")}</span>
                    </div>
                    <div className="flex items-start gap-2 text-muted-foreground">
                      <span className="mt-1 flex size-4 shrink-0 items-center justify-center rounded-sm bg-primary text-3xs text-primary-foreground">
                        ✓
                      </span>
                      <span className="line-through">{t("done2")}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 size-4 shrink-0 rounded-sm border border-input" />
                      <span>{t("todo1")}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 size-4 shrink-0 rounded-sm border border-input" />
                      <span>{t("todo2")}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="text-2xl font-semibold tracking-tight">
                      {t("afterDeploy")}
                    </div>
                    <p>{t("deployIntro")}</p>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 size-4 shrink-0 rounded-sm border border-input" />
                      <span>{t("deployTask1")}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="mt-1 size-4 shrink-0 rounded-sm border border-input" />
                      <span>{t("deployTask2")}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-sm font-medium text-muted-foreground">
                  <span className="flex items-center gap-2">
                    <FileTextIcon className="size-4" aria-hidden />
                    {t("attachedFiles")}
                  </span>
                  <span className="flex h-8 items-center gap-2 rounded-lg border border-input px-3 text-foreground">
                    <UploadIcon className="size-4" aria-hidden />
                    {t("uploadFile")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AppWindow>
      </ScaledScreen>
    </MockStage>
  )
}
